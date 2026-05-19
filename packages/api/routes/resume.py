import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from postgrest.exceptions import APIError

from core.auth import require_pro, verify_resume_api_user
from core.supabase_client import supabase
from services.latex_generator import generate_resume_pdf as compile_resume_pdf
from services.resume_parser import resume_parser
from services.resume_rewriter import resume_rewriter
from services.resume_scorer import resume_scorer
from services.resume_structurer import structure_resume_text

logger = logging.getLogger(__name__)

router = APIRouter()


def _embedded_users_row(users_field: object) -> Optional[dict]:
    """PostgREST may return embedded `users` as a dict or a single-element list."""
    if users_field is None:
        return None
    if isinstance(users_field, dict):
        return users_field
    if isinstance(users_field, list) and users_field:
        first = users_field[0]
        return first if isinstance(first, dict) else None
    return None


def _user_owns_resume_row(row: dict, users_row: Optional[dict], sub: str) -> bool:
    """JWT sub may be Clerk user id or Supabase public.users.id depending on token template."""
    if not users_row:
        return False
    if users_row.get("clerk_id") == sub:
        return True
    uid = row.get("user_id")
    return uid is not None and str(uid) == sub


def _execute_pg(description: str, fn):
    try:
        return fn()
    except APIError as e:
        logger.exception("%s: %s", description, getattr(e, "message", e))
        raise HTTPException(
            status_code=502,
            detail=getattr(e, "message", None) or str(e),
        ) from e


def _is_resume_variants_unavailable(exc: APIError) -> bool:
    """True when the table is missing or the query cannot run yet."""
    msg = (getattr(exc, "message", None) or str(exc)).lower()
    code = str(getattr(exc, "code", "") or "")
    return (
        "resume_variants" in msg
        or "does not exist" in msg
        or code in ("42P01", "PGRST205")
    )


def _fetch_resume_variant_row(
    *,
    user_supabase_id: str,
    resume_id: str,
    job_id: str,
) -> dict | None:
    try:
        resp = (
            supabase.table("resume_variants")
            .select("*")
            .eq("job_id", job_id)
            .eq("resume_id", resume_id)
            .eq("user_id", user_supabase_id)
            .limit(1)
            .execute()
        )
    except APIError as e:
        if _is_resume_variants_unavailable(e):
            logger.warning(
                "resume_variants unavailable: %s", getattr(e, "message", e)
            )
            return None
        raise HTTPException(
            status_code=502,
            detail=getattr(e, "message", None) or str(e),
        ) from e

    if resp is None:
        return None
    rows = resp.data if isinstance(resp.data, list) else []
    if not rows or not isinstance(rows[0], dict):
        return None
    return rows[0]


def _list_resume_variant_job_ids(
    *,
    user_supabase_id: str,
    resume_id: str,
) -> list[str]:
    try:
        resp = (
            supabase.table("resume_variants")
            .select("job_id")
            .eq("resume_id", resume_id)
            .eq("user_id", user_supabase_id)
            .execute()
        )
    except APIError as e:
        if _is_resume_variants_unavailable(e):
            logger.warning(
                "resume_variants list skipped: %s", getattr(e, "message", e)
            )
            return []
        raise HTTPException(
            status_code=502,
            detail=getattr(e, "message", None) or str(e),
        ) from e

    if resp is None:
        return []
    job_ids: list[str] = []
    for row in resp.data or []:
        if isinstance(row, dict) and row.get("job_id"):
            job_ids.append(str(row["job_id"]))
    return job_ids


def _analysis_insert_row(payload: dict) -> dict:
    """
    Insert analysis and return the new row dict with id.
    Retries without keys whose values are None so DB defaults can apply
    (avoids NOT NULL / malformed literal errors when passing explicit null).
    supabase-py v2: insert(...).execute() already returns the inserted rows
    in .data; chaining .select() on the insert builder raises AttributeError
    ('SyncQueryRequestBuilder' has no attribute 'select').
    """
    payloads_to_try = [payload]
    stripped = {k: v for k, v in payload.items() if v is not None}
    if stripped != payload:
        payloads_to_try.append(stripped)

    last_exc: Optional[Exception] = None
    for attempt in payloads_to_try:
        try:
            resp = (
                supabase.table("analyses")
                .insert(attempt)
                .execute()
            )
            data = resp.data
            rows = data if isinstance(data, list) else ([data] if data else [])
            if not rows:
                logger.error(
                    "analyses insert returned no rows keys=%s", list(attempt.keys())
                )
                last_exc = None
                continue
            row_out = rows[0]
            if isinstance(row_out, dict) and "id" in row_out:
                return row_out
        except APIError as e:
            last_exc = e
            logger.warning(
                "analyses insert attempt failed: %s", getattr(e, "message", e)
            )
        except Exception as e:
            last_exc = e
            logger.exception("analyses insert raised non-APIError")

    if last_exc:
        logger.exception(
            "analyses insert failed (all attempts): %s",
            getattr(last_exc, "message", last_exc),
        )
        raise HTTPException(
            status_code=502,
            detail=getattr(last_exc, "message", None) or str(last_exc),
        ) from last_exc

    raise HTTPException(
        status_code=500,
        detail="Failed to create analysis record",
    )


def load_prompt(name: str) -> str:
    path = Path(__file__).parent.parent / "prompts" / name
    return path.read_text(encoding="utf-8")


class ParseResumeRequest(BaseModel):
    resume_id: str

class ScoreResumeRequest(BaseModel):
    resume_id: str
    target_role: str


class AnalyzeResumeRequest(BaseModel):
    resume_id: str
    target_role: str


class RewriteResumeRequest(BaseModel):
    resume_id: str
    target_role: str
    analysis_id: Optional[str] = None


class RewriteForJobRequest(BaseModel):
    resume_id: str
    job_description: str
    target_role: str
    analysis_id: Optional[str] = None


class PdfResumeRequest(BaseModel):
    resume_id: str
    analysis_id: Optional[str] = None
    rewritten_resume: Optional[dict] = None


class GenerateVariantRequest(BaseModel):
    job_id: str
    resume_id: str


def _coerce_parsed_content(parsed_content: object) -> dict:
    if parsed_content is None:
        raise HTTPException(
            status_code=422,
            detail="Resume must be parsed first. Call POST /resume/parse.",
        )
    if isinstance(parsed_content, str):
        try:
            parsed_content = json.loads(parsed_content)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=422,
                detail="Parsed resume is invalid; run POST /resume/parse again.",
            )
    if not isinstance(parsed_content, dict):
        raise HTTPException(
            status_code=422,
            detail="Parsed resume is invalid; run POST /resume/parse again.",
        )
    return parsed_content


def _build_before_after(original: dict, rewritten: dict) -> list[dict]:
    """Compare bullets index-by-index between original and rewritten resume.

    Returns only changed bullets, tagged with their section and parent
    company/project name so the UI can render a focused diff.
    """
    diffs: list[dict] = []

    original_experience = original.get("experience") or []
    rewritten_experience = rewritten.get("experience") or []
    for i, exp in enumerate(original_experience):
        if not isinstance(exp, dict):
            continue
        original_bullets = exp.get("bullets") or []
        rewritten_entry = (
            rewritten_experience[i]
            if i < len(rewritten_experience) and isinstance(rewritten_experience[i], dict)
            else {}
        )
        rewritten_bullets = rewritten_entry.get("bullets") or []
        for orig, rewr in zip(original_bullets, rewritten_bullets):
            if orig != rewr:
                diffs.append(
                    {
                        "section": "experience",
                        "company": exp.get("company", ""),
                        "original": orig,
                        "rewritten": rewr,
                    }
                )

    original_projects = original.get("projects") or []
    rewritten_projects = rewritten.get("projects") or []
    for i, proj in enumerate(original_projects):
        if not isinstance(proj, dict):
            continue
        original_bullets = proj.get("bullets") or []
        rewritten_entry = (
            rewritten_projects[i]
            if i < len(rewritten_projects) and isinstance(rewritten_projects[i], dict)
            else {}
        )
        rewritten_bullets = rewritten_entry.get("bullets") or []
        for orig, rewr in zip(original_bullets, rewritten_bullets):
            if orig != rewr:
                diffs.append(
                    {
                        "section": "projects",
                        "name": proj.get("name", ""),
                        "original": orig,
                        "rewritten": rewr,
                    }
                )

    return diffs


def _load_owned_resume_row(
    resume_id: str,
    current_user: dict,
    *,
    select: str,
    operation: str = "load resume",
) -> dict:
    resume = _execute_pg(
        operation,
        lambda: supabase.table("resumes")
        .select(select)
        .eq("id", resume_id)
        .execute(),
    )
    rows = resume.data
    if not rows:
        raise HTTPException(status_code=404, detail="Resume not found")
    row = rows[0]
    users_row = _embedded_users_row(row.get("users"))
    if not _user_owns_resume_row(row, users_row, current_user["sub"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    return row


def _user_owns_analysis_row(row: dict, sub: str) -> bool:
    user_lookup = _execute_pg(
        "lookup user for analysis ownership",
        lambda: supabase.table("users")
        .select("id, clerk_id")
        .eq("clerk_id", sub)
        .limit(1)
        .execute(),
    )
    users_rows = user_lookup.data or []
    user_row = users_rows[0] if users_rows else None
    owns_by_clerk = bool(user_row and str(user_row.get("id")) == str(row.get("user_id")))
    owns_by_sub = str(row.get("user_id")) == str(sub)
    return owns_by_clerk or owns_by_sub


_DEFAULT_BREAKDOWN: dict[str, int] = {
    "experience": 0,
    "metrics": 0,
    "structure": 0,
    "keywords": 0,
}


def _analysis_score_snapshot(*, resume_id: str, user_id: str) -> dict:
    """Return score, breakdown, and weaknesses for a new analyses insert."""
    prior = _execute_pg(
        "load prior analysis for rewrite score snapshot",
        lambda: supabase.table("analyses")
        .select("score, breakdown, weaknesses")
        .eq("resume_id", resume_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute(),
    )
    rows = prior.data or []
    if rows:
        row = rows[0]
        score = row.get("score")
        return {
            "score": score if score is not None else 0,
            "breakdown": row.get("breakdown") or dict(_DEFAULT_BREAKDOWN),
            "weaknesses": row.get("weaknesses") or [],
        }
    return {
        "score": 0,
        "breakdown": dict(_DEFAULT_BREAKDOWN),
        "weaknesses": [],
    }


def _persist_rewrite_analysis(
    *,
    user_id: str,
    resume_id: str,
    target_role: str,
    rewritten: dict,
    before_after: list,
    analysis_id: Optional[str],
    current_user: dict,
) -> dict:
    """
    Store rewrite output on an existing analysis (preferred) or insert a new row
    with score fields copied from the latest analysis for this resume.
    """
    if analysis_id:
        existing = _execute_pg(
            "load analysis for rewrite update",
            lambda: supabase.table("analyses")
            .select("id, resume_id, user_id")
            .eq("id", analysis_id)
            .execute(),
        )
        rows = existing.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Analysis not found")
        row = rows[0]
        if not _user_owns_analysis_row(row, current_user["sub"]):
            raise HTTPException(status_code=403, detail="Forbidden")
        if str(row.get("resume_id") or "") != str(resume_id):
            raise HTTPException(
                status_code=422,
                detail="analysis_id does not belong to this resume",
            )

        _execute_pg(
            "update analysis with rewrite",
            lambda: supabase.table("analyses")
            .update(
                {
                    "rewritten_resume": rewritten,
                    "before_after": before_after,
                    "target_role": target_role,
                }
            )
            .eq("id", analysis_id)
            .execute(),
        )
        return {"id": analysis_id}

    snapshot = _analysis_score_snapshot(resume_id=resume_id, user_id=user_id)
    return _analysis_insert_row(
        {
            "user_id": user_id,
            "resume_id": resume_id,
            "target_role": target_role,
            "rewritten_resume": rewritten,
            "before_after": before_after,
            **snapshot,
        }
    )


def _resolve_supabase_user_id(sub: str) -> str:
    user_lookup = _execute_pg(
        "lookup user for resume variants",
        lambda: supabase.table("users")
        .select("id, clerk_id")
        .eq("clerk_id", sub)
        .limit(1)
        .execute(),
    )
    rows = user_lookup.data or []
    if not rows or not rows[0].get("id"):
        raise HTTPException(status_code=404, detail="User not found")
    return str(rows[0]["id"])


def _resolve_resume_content_for_pdf(
    *,
    resume_id: str,
    analysis_id: Optional[str],
    rewritten_resume: Optional[dict],
    current_user: dict,
) -> dict:
    """Return parsed or rewritten resume JSON to feed the LaTeX generator."""
    if rewritten_resume is not None:
        _load_owned_resume_row(
            resume_id,
            current_user,
            select="id, user_id, users!inner(clerk_id)",
            operation="verify resume for inline pdf",
        )
        return _coerce_parsed_content(rewritten_resume)

    if analysis_id:
        analysis = _execute_pg(
            "load analysis for pdf",
            lambda: supabase.table("analyses")
            .select("id, resume_id, user_id, rewritten_resume")
            .eq("id", analysis_id)
            .execute(),
        )
        rows = analysis.data
        if not rows:
            raise HTTPException(status_code=404, detail="Analysis not found")
        row = rows[0]
        if not _user_owns_analysis_row(row, current_user["sub"]):
            raise HTTPException(status_code=403, detail="Forbidden")
        if str(row.get("resume_id") or "") != str(resume_id):
            raise HTTPException(
                status_code=422,
                detail="analysis_id does not belong to this resume",
            )
        rewritten = row.get("rewritten_resume")
        if rewritten is not None:
            return _coerce_parsed_content(rewritten)

    resume_row = _load_owned_resume_row(
        resume_id,
        current_user,
        select="parsed_content, user_id, users!inner(clerk_id)",
        operation="load resume for pdf",
    )
    return _coerce_parsed_content(resume_row["parsed_content"])


@router.post("/parse")
async def parse_resume(
    request: ParseResumeRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    resume = _execute_pg(
        "load resume for parse",
        lambda: supabase.table("resumes")
        .select("storage_path, file_type, user_id, users!inner(clerk_id)")
        .eq("id", request.resume_id)
        .execute(),
    )

    rows = resume.data
    if not rows:
        raise HTTPException(status_code=404, detail="Resume not found")

    row = rows[0]
    users_row = _embedded_users_row(row.get("users"))
    if not _user_owns_resume_row(row, users_row, current_user["sub"]):
        raise HTTPException(status_code=403, detail="Forbidden")

    storage_path = row["storage_path"]
    file_type = row["file_type"]

    raw_text = await resume_parser.parse_resume(storage_path, file_type)
    parsed = await structure_resume_text(raw_text)

    _execute_pg(
        "save parsed resume",
        lambda: supabase.table("resumes")
        .update({"parsed_content": parsed})
        .eq("id", request.resume_id)
        .execute(),
    )

    return parsed


@router.post("/score")
async def score_resume(
    request: ScoreResumeRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    row = _load_owned_resume_row(
        request.resume_id,
        current_user,
        select="parsed_content, user_id, users!inner(clerk_id)",
        operation="load resume for score",
    )
    parsed_content = _coerce_parsed_content(row["parsed_content"])

    result = await resume_scorer.score_resume(parsed_content, request.target_role)

    _analysis_insert_row(
        {
            "user_id": row["user_id"],
            "resume_id": request.resume_id,
            "target_role": request.target_role,
            "score": result["score"],
            "breakdown": result["breakdown"],
            "weaknesses": result["weaknesses"],
            "rewritten_resume": None,
            "before_after": [],
        }
    )

    return result


@router.post("/analyze")
async def analyze_resume(
    request: AnalyzeResumeRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    resume = _execute_pg(
        "load resume for analyze",
        lambda: supabase.table("resumes")
        .select("storage_path, file_type, user_id, users!inner(clerk_id)")
        .eq("id", request.resume_id)
        .execute(),
    )

    rows = resume.data
    if not rows:
        raise HTTPException(status_code=404, detail="Resume not found")

    row = rows[0]
    users_row = _embedded_users_row(row.get("users"))
    if not _user_owns_resume_row(row, users_row, current_user["sub"]):
        raise HTTPException(status_code=403, detail="Forbidden")

    storage_path = row["storage_path"]
    file_type = row["file_type"]

    raw_text = await resume_parser.parse_resume(storage_path, file_type)
    parsed_content = await structure_resume_text(raw_text)

    _execute_pg(
        "save parsed resume after analyze",
        lambda: supabase.table("resumes")
        .update({"parsed_content": parsed_content})
        .eq("id", request.resume_id)
        .execute(),
    )

    result = await resume_scorer.score_resume(parsed_content, request.target_role)

    analysis_row = _analysis_insert_row(
        {
            "user_id": row["user_id"],
            "resume_id": request.resume_id,
            "target_role": request.target_role,
            "score": result["score"],
            "breakdown": result["breakdown"],
            "weaknesses": result["weaknesses"],
            "rewritten_resume": None,
            "before_after": [],
        }
    )

    return {
        "parsed": parsed_content,
        "score": result["score"],
        "breakdown": result["breakdown"],
        "weaknesses": result["weaknesses"],
        "resume_id": request.resume_id,
        "analysis_id": str(analysis_row["id"]),
    }


@router.get("/analyses")
async def list_analyses(
    limit: int = 10,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    """List the current user's most recent analyses for the dashboard.

    Browser reads with anon key + RLS can hide rows inserted by the service
    role, which causes stale Scout Score on the dashboard. We use the service
    role here and enforce ownership server-side.
    """
    capped = max(1, min(limit, 50))
    sub = current_user["sub"]

    user_lookup = _execute_pg(
        "lookup user for analyses list",
        lambda: supabase.table("users")
        .select("id, clerk_id")
        .eq("clerk_id", sub)
        .limit(1)
        .execute(),
    )
    rows = user_lookup.data or []
    if not rows:
        return {"analyses": []}

    supabase_user_id = rows[0].get("id")
    if not supabase_user_id:
        return {"analyses": []}

    analyses = _execute_pg(
        "list analyses by user",
        lambda: supabase.table("analyses")
        .select("id, resume_id, score, target_role, created_at")
        .eq("user_id", supabase_user_id)
        .order("created_at", desc=True)
        .limit(capped)
        .execute(),
    )

    out = []
    for row in analyses.data or []:
        out.append(
            {
                "id": str(row.get("id") or ""),
                "resume_id": str(row.get("resume_id") or ""),
                "score": row.get("score"),
                "target_role": row.get("target_role") or "",
                "created_at": row.get("created_at"),
            }
        )

    return {"analyses": out}


def _save_resume_variant(
    *,
    user_supabase_id: str,
    resume_id: str,
    job_id: str,
    rewritten: dict,
) -> dict:
    """Insert or update a variant row (no upsert — works without a unique constraint)."""
    existing = _fetch_resume_variant_row(
        user_supabase_id=user_supabase_id,
        resume_id=resume_id,
        job_id=job_id,
    )
    if existing and existing.get("id"):
        resp = _execute_pg(
            "update resume variant",
            lambda: supabase.table("resume_variants")
            .update({"rewritten_resume": rewritten})
            .eq("id", existing["id"])
            .execute(),
        )
        rows = (resp.data if resp is not None else None) or []
        if rows and isinstance(rows[0], dict):
            return rows[0]
        return {**existing, "rewritten_resume": rewritten}

    payload = {
        "user_id": user_supabase_id,
        "resume_id": resume_id,
        "job_id": job_id,
        "rewritten_resume": rewritten,
    }
    resp = _execute_pg(
        "insert resume variant",
        lambda: supabase.table("resume_variants").insert(payload).execute(),
    )
    rows = (resp.data if resp is not None else None) or []
    if rows and isinstance(rows[0], dict):
        return rows[0]
    return payload


@router.get("/variant")
async def get_resume_variant(
    job_id: str = Query(..., min_length=1),
    resume_id: str = Query(..., min_length=1),
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    user_supabase_id = _resolve_supabase_user_id(current_user["sub"])
    _load_owned_resume_row(
        resume_id,
        current_user,
        select="id, user_id, users!inner(clerk_id)",
        operation="verify resume for variant lookup",
    )

    row = _fetch_resume_variant_row(
        user_supabase_id=user_supabase_id,
        resume_id=resume_id,
        job_id=job_id,
    )
    if row:
        return {"cached": True, "variant": row}
    return {"cached": False, "variant": None}


@router.get("/variants")
async def list_resume_variants(
    resume_id: str = Query(..., min_length=1),
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    """Return job_ids that already have a cached variant for this resume."""
    user_supabase_id = _resolve_supabase_user_id(current_user["sub"])
    _load_owned_resume_row(
        resume_id,
        current_user,
        select="id, user_id, users!inner(clerk_id)",
        operation="verify resume for variants list",
    )

    job_ids = _list_resume_variant_job_ids(
        user_supabase_id=user_supabase_id,
        resume_id=resume_id,
    )
    return {"job_ids": job_ids}


@router.post("/generate-variant")
async def generate_resume_variant(
    request: GenerateVariantRequest,
    current_user: dict = Depends(require_pro),
) -> dict:
    user_supabase_id = _resolve_supabase_user_id(current_user["sub"])
    resume_row = _load_owned_resume_row(
        request.resume_id,
        current_user,
        select="parsed_content, user_id, users!inner(clerk_id)",
        operation="load resume for variant generation",
    )
    parsed_content = _coerce_parsed_content(resume_row["parsed_content"])

    job_resp = _execute_pg(
        "load job for variant generation",
        lambda: supabase.table("jobs")
        .select("id, title, company, description")
        .eq("id", request.job_id)
        .execute(),
    )
    job_rows = job_resp.data or []
    if not job_rows:
        raise HTTPException(status_code=404, detail="Job not found")
    job = job_rows[0]
    description = (job.get("description") or "").strip()
    if not description:
        raise HTTPException(
            status_code=422,
            detail="No description available for this job",
        )

    title = (job.get("title") or "Role").strip()
    company = (job.get("company") or "Company").strip()
    job_description = f"{title} at {company}\n\n{description}"

    rewritten = await resume_rewriter.jd_specific_rewrite(
        parsed_content,
        job_description,
    )

    variant_row = _save_resume_variant(
        user_supabase_id=user_supabase_id,
        resume_id=request.resume_id,
        job_id=request.job_id,
        rewritten=rewritten,
    )

    return {
        "cached": False,
        "variant": variant_row,
    }


@router.get("/analysis/{analysis_id}")
async def get_analysis(
    analysis_id: str,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    """
    Browser uses anon key + RLS, which hides analyses inserted by service role.
    This endpoint reads with service role and enforces user ownership server-side.
    """
    analysis = _execute_pg(
        "load analysis by id",
        lambda: supabase.table("analyses")
        .select(
            "id, resume_id, target_role, score, breakdown, weaknesses, user_id"
        )
        .eq("id", analysis_id)
        .execute(),
    )

    rows = analysis.data
    if not rows:
        raise HTTPException(status_code=404, detail="Analysis not found")

    row = rows[0]
    if not _user_owns_analysis_row(row, current_user["sub"]):
        raise HTTPException(status_code=403, detail="Forbidden")

    return {
        "id": str(row["id"]),
        "resume_id": str(row.get("resume_id") or ""),
        "target_role": row.get("target_role") or "",
        "score": row.get("score"),
        "breakdown": row.get("breakdown"),
        "weaknesses": row.get("weaknesses") or [],
    }


@router.post("/rewrite")
async def rewrite_resume(
    request: RewriteResumeRequest,
    current_user: dict = Depends(require_pro),
) -> dict:
    row = _load_owned_resume_row(
        request.resume_id,
        current_user,
        select="parsed_content, user_id, users!inner(clerk_id)",
    )
    parsed_content = _coerce_parsed_content(row["parsed_content"])

    rewritten = await resume_rewriter.general_rewrite(parsed_content)
    before_after = _build_before_after(parsed_content, rewritten)

    analysis_row = _persist_rewrite_analysis(
        user_id=str(row["user_id"]),
        resume_id=request.resume_id,
        target_role=request.target_role,
        rewritten=rewritten,
        before_after=before_after,
        analysis_id=request.analysis_id,
        current_user=current_user,
    )

    return {
        "resume_id": request.resume_id,
        "target_role": request.target_role,
        "analysis_id": str(analysis_row["id"]),
        "rewritten": rewritten,
        "before_after": before_after,
    }


@router.post("/rewrite-for-job")
async def rewrite_resume_for_job(
    request: RewriteForJobRequest,
    current_user: dict = Depends(require_pro),
) -> dict:
    row = _load_owned_resume_row(
        request.resume_id,
        current_user,
        select="parsed_content, user_id, users!inner(clerk_id)",
    )
    parsed_content = _coerce_parsed_content(row["parsed_content"])

    if not request.job_description.strip():
        raise HTTPException(status_code=422, detail="job_description is required")

    rewritten = await resume_rewriter.jd_specific_rewrite(
        parsed_content,
        request.job_description.strip(),
    )

    analysis_row = _persist_rewrite_analysis(
        user_id=str(row["user_id"]),
        resume_id=request.resume_id,
        target_role=request.target_role,
        rewritten=rewritten,
        before_after=[],
        analysis_id=request.analysis_id,
        current_user=current_user,
    )

    return {
        "resume_id": request.resume_id,
        "target_role": request.target_role,
        "analysis_id": str(analysis_row["id"]),
        "rewritten": rewritten,
    }


@router.post("/pdf")
async def generate_resume_pdf_endpoint(
    request: PdfResumeRequest,
    current_user: dict = Depends(require_pro),
) -> Response:
    """Compile parsed (or rewritten) resume JSON into a Jake-format PDF."""
    resume_content = _resolve_resume_content_for_pdf(
        resume_id=request.resume_id,
        analysis_id=request.analysis_id,
        rewritten_resume=request.rewritten_resume,
        current_user=current_user,
    )

    pdf_bytes = await run_in_threadpool(compile_resume_pdf, resume_content)

    filename = f"resume-{request.resume_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

