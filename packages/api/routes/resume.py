import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from postgrest.exceptions import APIError

from core.ai_json import parse_ai_json_object
from core.ai_router import call_ai
from core.auth import verify_resume_api_user
from core.supabase_client import supabase
from services.resume_parser import resume_parser
from services.resume_rewriter import resume_rewriter
from services.resume_scorer import resume_scorer

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


class RewriteForJobRequest(BaseModel):
    resume_id: str
    job_description: str
    target_role: str


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
    parse_prompt = load_prompt("parse_prompt.txt")
    ai_response = await call_ai(prompt=raw_text, system=parse_prompt, task="fast")

    if ai_response is None or not str(ai_response).strip():
        raise HTTPException(status_code=500, detail="AI returned empty response")

    parsed = parse_ai_json_object(str(ai_response), context="Parse AI")

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
    parse_prompt = load_prompt("parse_prompt.txt")
    parse_ai_response = await call_ai(
        prompt=raw_text, system=parse_prompt, task="fast"
    )

    if parse_ai_response is None or not str(parse_ai_response).strip():
        raise HTTPException(status_code=500, detail="AI returned empty response")

    parsed_content = parse_ai_json_object(
        str(parse_ai_response), context="Parse AI"
    )

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
            "id, resume_id, target_role, score, breakdown, weaknesses, "
            "rewritten_resume, user_id"
        )
        .eq("id", analysis_id)
        .execute(),
    )

    rows = analysis.data
    if not rows:
        raise HTTPException(status_code=404, detail="Analysis not found")

    row = rows[0]
    sub = current_user["sub"]

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
    if not (owns_by_clerk or owns_by_sub):
        raise HTTPException(status_code=403, detail="Forbidden")

    return {
        "id": str(row["id"]),
        "resume_id": str(row.get("resume_id") or ""),
        "target_role": row.get("target_role") or "",
        "score": row.get("score"),
        "breakdown": row.get("breakdown"),
        "weaknesses": row.get("weaknesses") or [],
        "rewritten_resume": row.get("rewritten_resume"),
    }


@router.post("/rewrite")
async def rewrite_resume(
    request: RewriteResumeRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    row = _load_owned_resume_row(
        request.resume_id,
        current_user,
        select="parsed_content, user_id, users!inner(clerk_id)",
        operation="load resume for rewrite",
    )
    parsed_content = _coerce_parsed_content(row["parsed_content"])

    rewritten = await resume_rewriter.general_rewrite(parsed_content)

    analysis_row = _analysis_insert_row(
        {
            "user_id": row["user_id"],
            "resume_id": request.resume_id,
            "target_role": request.target_role,
            "rewritten_resume": rewritten,
        }
    )

    return {
        "resume_id": request.resume_id,
        "target_role": request.target_role,
        "analysis_id": str(analysis_row["id"]),
        "rewritten": rewritten,
    }


@router.post("/rewrite-for-job")
async def rewrite_resume_for_job(
    request: RewriteForJobRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    row = _load_owned_resume_row(
        request.resume_id,
        current_user,
        select="parsed_content, user_id, users!inner(clerk_id)",
        operation="load resume for rewrite-for-job",
    )
    parsed_content = _coerce_parsed_content(row["parsed_content"])

    if not request.job_description.strip():
        raise HTTPException(status_code=422, detail="job_description is required")

    rewritten = await resume_rewriter.jd_specific_rewrite(
        parsed_content,
        request.job_description.strip(),
    )

    analysis_row = _analysis_insert_row(
        {
            "user_id": row["user_id"],
            "resume_id": request.resume_id,
            "target_role": request.target_role,
            "rewritten_resume": rewritten,
        }
    )

    return {
        "resume_id": request.resume_id,
        "target_role": request.target_role,
        "analysis_id": str(analysis_row["id"]),
        "rewritten": rewritten,
    }


@router.post("/pdf")
async def generate_resume_pdf() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")

