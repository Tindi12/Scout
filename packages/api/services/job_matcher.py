import logging

from dotenv import load_dotenv
from postgrest.exceptions import APIError

from core.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)

_JOB_SELECT = (
    "id, title, company, location, remote, "
    "skills_required, url, portal, visa_sponsorship, description"
)


def _fetch_jobs_table_scan(limit: int) -> list[dict]:
    response = (
        supabase.table("jobs")
        .select(_JOB_SELECT)
        .limit(limit)
        .execute()
    )
    return response.data or []


def _get_candidate_jobs(
    resume_embedding: list[float],
    is_pro: bool,
    requires_sponsorship: bool,
    limit: int,
) -> list[dict]:
    fetch_limit = limit * 3

    if is_pro:
        try:
            response = supabase.rpc(
                "match_jobs_semantic",
                {
                    "query_embedding": resume_embedding,
                    "match_count": fetch_limit,
                    "filter_sponsorship": requires_sponsorship,
                },
            ).execute()
            return response.data or []
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


def _skill_matches(required: str, resume_skills_lower: list[str]) -> bool:
    req = required.lower().strip()
    if not req:
        return False
    for rs in resume_skills_lower:
        if req in rs or rs in req:
            return True
    return False


def _hard_score(
    required: list[str],
    resume_skills_lower: list[str],
    job: dict,
    is_pro: bool,
) -> tuple[float, list[str]]:
    if not required:
        if is_pro and job.get("similarity") is not None:
            return float(job["similarity"]) * 100, []
        return 35.0, []

    matched = [s for s in required if _skill_matches(s, resume_skills_lower)]
    return len(matched) / len(required) * 100, matched


def _assign_fit_categories(jobs: list[dict]) -> list[dict]:
    """
    Bucket by rank within the returned set. Absolute score thresholds cluster
    most Pro matches in GOOD_FIT (hard floor 50 + semantic blend).
    """
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
    is_pro: bool,
) -> dict | None:
    try:
        required: list[str] = job.get("skills_required") or []
        hard_score, matched_skills = _hard_score(
            required, resume_skills_lower, job, is_pro
        )

        if is_pro and job.get("similarity") is not None:
            semantic_score = float(job["similarity"]) * 100
        else:
            semantic_score = hard_score

        if is_pro and job.get("similarity") is not None:
            if required:
                final_score = hard_score * 0.4 + semantic_score * 0.6
            else:
                final_score = semantic_score
        else:
            final_score = hard_score

        if final_score < 25:
            return None

        return {
            "id": job.get("id", ""),
            "title": job.get("title", ""),
            "company": job.get("company", ""),
            "location": job.get("location", ""),
            "remote": job.get("remote", False),
            "skills_required": required,
            "url": job.get("url", ""),
            "portal": job.get("portal", ""),
            "visa_sponsorship": job.get("visa_sponsorship", "unknown"),
            "description": job.get("description") or "",
            "hard_score": round(hard_score, 1),
            "semantic_score": round(semantic_score, 1),
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
    is_pro: bool = False,
    requires_sponsorship: bool = False,
    limit: int = 50,
) -> list[dict]:
    from starlette.concurrency import run_in_threadpool

    candidates = await run_in_threadpool(
        _get_candidate_jobs, resume_embedding, is_pro, requires_sponsorship, limit
    )

    resume_skills_lower = _extract_resume_skills(parsed_resume)

    scored: list[dict] = []
    for job in candidates:
        if requires_sponsorship and job.get("visa_sponsorship") == "no":
            continue
        result = _score_job(job, resume_skills_lower, is_pro)
        if result is not None:
            scored.append(result)

    scored.sort(key=lambda j: j["final_score"], reverse=True)
    top = _assign_fit_categories(scored[:limit])

    strong = sum(1 for j in top if j["category"] == "STRONG_FIT")
    good = sum(1 for j in top if j["category"] == "GOOD_FIT")
    stretch = sum(1 for j in top if j["category"] == "STRETCH")
    logger.info("Matched: %d strong, %d good, %d stretch", strong, good, stretch)

    return top
