import logging
import re

from dotenv import load_dotenv
from postgrest.exceptions import APIError

from core.supabase_client import supabase
from services.role_keywords import role_label, role_relevance_score

load_dotenv()

logger = logging.getLogger(__name__)

_JOB_SELECT = (
    "id, title, company, location, remote, "
    "skills_required, url, portal, visa_sponsorship, description"
)

_MIN_ROLE_RELEVANCE = 20.0
_MIN_FINAL_SCORE = 28.0


def _fetch_jobs_table_scan(limit: int) -> list[dict]:
    response = (
        supabase.table("jobs")
        .select(_JOB_SELECT)
        .limit(limit)
        .execute()
    )
    return response.data or []


def _get_applied_job_ids(user_id: str) -> set[str]:
    """Job ids the user has already successfully applied to (status='applied').

    Failed / needs_attention applications are intentionally excluded so those jobs
    reappear in matches and can be retried.
    """
    try:
        response = (
            supabase.table("applications")
            .select("job_id")
            .eq("user_id", user_id)
            .eq("status", "applied")
            .execute()
        )
    except APIError as e:
        logger.warning(
            "applied-jobs lookup failed (%s); not excluding any",
            getattr(e, "message", e),
        )
        return set()

    return {
        row["job_id"]
        for row in (response.data or [])
        if isinstance(row, dict) and row.get("job_id")
    }


def _get_candidate_jobs(
    resume_embedding: list[float],
    requires_sponsorship: bool,
    limit: int,
) -> list[dict]:
    fetch_limit = limit * 4

    try:
        response = supabase.rpc(
            "match_jobs_semantic",
            {
                "query_embedding": resume_embedding,
                "match_count": fetch_limit,
                "filter_sponsorship": requires_sponsorship,
            },
        ).execute()
        rows = response.data or []
        if rows:
            return rows
    except APIError as e:
        logger.warning(
            "match_jobs_semantic failed (%s); falling back to table scan",
            getattr(e, "message", e),
        )

    return _fetch_jobs_table_scan(fetch_limit)


def _extract_resume_skills(parsed_resume: dict) -> list[str]:
    skills_dict = parsed_resume.get("skills", {})
    resume_skills: list[str] = []
    if isinstance(skills_dict, dict):
        for value in skills_dict.values():
            if isinstance(value, list):
                resume_skills.extend(value)
            elif isinstance(value, str):
                resume_skills.append(value)
    elif isinstance(skills_dict, list):
        resume_skills = skills_dict
    return [s.lower().strip() for s in resume_skills if isinstance(s, str) and s.strip()]


def _normalize_required_skills(required: list[str]) -> list[str]:
    cleaned: list[str] = []
    for skill in required:
        if not isinstance(skill, str):
            continue
        s = skill.strip()
        if not s:
            continue
        if len(s) == 1:
            continue
        cleaned.append(s)
    return cleaned


def _skill_matches(required: str, resume_skills_lower: list[str]) -> bool:
    req = required.lower().strip()
    if not req or len(req) < 2:
        return False

    for rs in resume_skills_lower:
        if req == rs:
            return True
        if "+" in req or "+" in rs:
            if req in rs or rs in req:
                return True
            continue
        if len(req) >= 3 and len(rs) >= 3:
            req_tokens = set(re.split(r"[\s/+.]+", req))
            rs_tokens = set(re.split(r"[\s/+.]+", rs))
            req_tokens = {t for t in req_tokens if len(t) >= 3}
            rs_tokens = {t for t in rs_tokens if len(t) >= 3}
            if req_tokens & rs_tokens:
                return True
            if req in rs or rs in req:
                return True
    return False


def _hard_score(
    required: list[str],
    resume_skills_lower: list[str],
) -> tuple[float, list[str]]:
    required = _normalize_required_skills(required)
    if not required:
        return 0.0, []

    matched = [s for s in required if _skill_matches(s, resume_skills_lower)]
    return len(matched) / len(required) * 100, matched


def _semantic_score(job: dict) -> float:
    sim = job.get("similarity")
    if sim is None:
        return 0.0
    value = float(sim)
    if value > 1.0:
        value = max(0.0, 1.0 - value)
    return max(0.0, min(100.0, value * 100))


def _resume_quality_factor(resume_quality_score: int | None) -> float:
    if resume_quality_score is None:
        return 1.0
    score = max(0, min(100, int(resume_quality_score)))
    return 0.45 + 0.55 * (score / 100.0)


def _assign_fit_categories(jobs: list[dict]) -> list[dict]:
    n = len(jobs)
    if n == 0:
        return jobs
    if n == 1:
        jobs[0]["category"] = "STRONG_FIT"
        return jobs
    if n == 2:
        jobs[0]["category"] = "STRONG_FIT"
        jobs[1]["category"] = "GOOD_FIT"
        return jobs

    strong_count = max(1, round(n * 0.30))
    stretch_count = max(1, round(n * 0.30))
    good_count = n - strong_count - stretch_count
    if good_count < 1:
        if strong_count >= stretch_count:
            strong_count -= 1
        else:
            stretch_count -= 1
        good_count = 1

    for i, job in enumerate(jobs):
        if i < strong_count:
            job["category"] = "STRONG_FIT"
        elif i < strong_count + good_count:
            job["category"] = "GOOD_FIT"
        else:
            job["category"] = "STRETCH"
    return jobs


def _score_job(
    job: dict,
    resume_skills_lower: list[str],
    *,
    target_role_ids: list[str],
    target_role_label: str | None,
    resume_quality_score: int | None,
) -> dict | None:
    try:
        required: list[str] = job.get("skills_required") or []
        role_score = role_relevance_score(job, target_role_ids, target_role_label)

        if role_score < _MIN_ROLE_RELEVANCE:
            return None

        hard_score, matched_skills = _hard_score(required, resume_skills_lower)
        semantic = _semantic_score(job)

        if hard_score > 0 and semantic > 0:
            blended = hard_score * 0.35 + semantic * 0.25 + role_score * 0.40
        elif semantic > 0:
            blended = semantic * 0.45 + role_score * 0.55
        elif hard_score > 0:
            blended = hard_score * 0.45 + role_score * 0.55
        else:
            blended = role_score * 0.85

        final_score = blended * _resume_quality_factor(resume_quality_score)
        final_score = min(final_score, blended)
        final_score = max(0.0, min(100.0, final_score))

        if final_score < _MIN_FINAL_SCORE:
            return None

        return {
            "id": job.get("id", ""),
            "title": job.get("title", ""),
            "company": job.get("company", ""),
            "location": job.get("location", ""),
            "remote": job.get("remote", False),
            "skills_required": _normalize_required_skills(required),
            "url": job.get("url", ""),
            "portal": job.get("portal", ""),
            "visa_sponsorship": job.get("visa_sponsorship", "unknown"),
            "description": job.get("description") or "",
            "hard_score": round(hard_score, 1),
            "semantic_score": round(semantic, 1),
            "role_score": round(role_score, 1),
            "final_score": round(final_score, 1),
            "category": "GOOD_FIT",
            "matched_skills": matched_skills,
        }
    except Exception as e:
        logger.warning("Skipping job id=%s due to scoring error: %s", job.get("id"), e)
        return None


async def match_jobs(
    parsed_resume: dict,
    resume_embedding: list[float],
    plan: str = "free",
    requires_sponsorship: bool = False,
    limit: int = 50,
    *,
    user_id: str | None = None,
    target_role_ids: list[str] | None = None,
    target_role_label: str | None = None,
    resume_quality_score: int | None = None,
) -> list[dict]:
    from starlette.concurrency import run_in_threadpool

    _ = plan  # reserved for future tier-specific ranking tweaks
    role_ids = target_role_ids or []

    candidates = await run_in_threadpool(
        _get_candidate_jobs,
        resume_embedding,
        requires_sponsorship,
        limit,
    )

    applied_job_ids: set[str] = set()
    if user_id:
        applied_job_ids = await run_in_threadpool(_get_applied_job_ids, user_id)

    resume_skills_lower = _extract_resume_skills(parsed_resume)

    scored: list[dict] = []
    for job in candidates:
        if job.get("id") in applied_job_ids:
            continue
        if requires_sponsorship and job.get("visa_sponsorship") == "no":
            continue
        result = _score_job(
            job,
            resume_skills_lower,
            target_role_ids=role_ids,
            target_role_label=target_role_label,
            resume_quality_score=resume_quality_score,
        )
        if result is not None:
            scored.append(result)

    scored.sort(key=lambda j: j["final_score"], reverse=True)
    top = _assign_fit_categories(scored[:limit])

    strong = sum(1 for j in top if j["category"] == "STRONG_FIT")
    good = sum(1 for j in top if j["category"] == "GOOD_FIT")
    stretch = sum(1 for j in top if j["category"] == "STRETCH")
    logger.info(
        "Matched: %d strong, %d good, %d stretch (roles=%s, resume_score=%s)",
        strong,
        good,
        stretch,
        role_ids or target_role_label,
        resume_quality_score,
    )

    return top


def _fetch_jobs_title_search(terms: list[str], limit: int) -> list[dict]:
    """Exact-ish title hits across the whole jobs table (complements semantic)."""
    rows: list[dict] = []
    seen: set[str] = set()
    for term in terms[:3]:
        cleaned = term.strip().replace("%", "").replace("_", " ")
        if len(cleaned) < 3:
            continue
        try:
            response = (
                supabase.table("jobs")
                .select(_JOB_SELECT)
                .ilike("title", f"%{cleaned}%")
                .limit(limit)
                .execute()
            )
        except APIError as e:
            logger.warning(
                "title search failed for %r (%s)", cleaned, getattr(e, "message", e)
            )
            continue
        for row in response.data or []:
            job_id = row.get("id")
            if not job_id or job_id in seen:
                continue
            seen.add(job_id)
            rows.append(row)
    return rows


async def search_jobs(
    query: str,
    query_embedding: list[float],
    parsed_resume: dict,
    *,
    role_ids: list[str],
    requires_sponsorship: bool = False,
    limit: int = 50,
    user_id: str | None = None,
    resume_quality_score: int | None = None,
) -> list[dict]:
    """Search the whole jobs table for a role the user typed, then rank by fit.

    Retrieval is query-driven (semantic + title match) so results are NOT
    limited to the user's onboarding roles — a SWE can search "cheme".
    Scoring still uses the user's resume skills, so fit categories reflect how
    competitive *they* are within the searched role.
    """
    from starlette.concurrency import run_in_threadpool

    # Title terms: the raw query plus resolved discipline labels ("cheme" alone
    # would ILIKE-match nothing, but its label contributes "chemical").
    terms: list[str] = [query]
    for role_id in role_ids:
        label = role_label(role_id)
        if label:
            terms.append(label.replace("Engineering", "").strip() or label)

    semantic_rows = await run_in_threadpool(
        _get_candidate_jobs,
        query_embedding,
        requires_sponsorship,
        limit,
    )
    keyword_rows = await run_in_threadpool(_fetch_jobs_title_search, terms, limit * 2)

    candidates: list[dict] = []
    seen: set[str] = set()
    for job in [*semantic_rows, *keyword_rows]:
        job_id = job.get("id")
        if not job_id or job_id in seen:
            continue
        seen.add(job_id)
        candidates.append(job)

    applied_job_ids: set[str] = set()
    if user_id:
        applied_job_ids = await run_in_threadpool(_get_applied_job_ids, user_id)

    resume_skills_lower = _extract_resume_skills(parsed_resume)

    scored: list[dict] = []
    for job in candidates:
        if job.get("id") in applied_job_ids:
            continue
        if requires_sponsorship and job.get("visa_sponsorship") == "no":
            continue
        # Relevance is judged against the SEARCHED role, not the user's
        # onboarding target roles — that's what opens up the full database.
        result = _score_job(
            job,
            resume_skills_lower,
            target_role_ids=role_ids,
            target_role_label=query,
            resume_quality_score=resume_quality_score,
        )
        if result is not None:
            scored.append(result)

    scored.sort(key=lambda j: j["final_score"], reverse=True)
    top = _assign_fit_categories(scored[:limit])
    logger.info(
        "Search %r (roles=%s): %d candidates -> %d results",
        query,
        role_ids,
        len(candidates),
        len(top),
    )
    return top
