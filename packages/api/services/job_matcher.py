import logging

from dotenv import load_dotenv

from core.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)


def _get_candidate_jobs(
    resume_embedding: list[float],
    is_pro: bool,
    requires_sponsorship: bool,
    limit: int,
) -> list[dict]:
    if is_pro:
        response = supabase.rpc(
            "match_jobs_semantic",
            {
                "query_embedding": resume_embedding,
                "match_count": limit * 3,
                "filter_sponsorship": requires_sponsorship,
            },
        ).execute()
    else:
        response = (
            supabase.table("jobs")
            .select(
                "id, title, company, location, remote, "
                "skills_required, url, portal, visa_sponsorship, description"
            )
            .limit(limit * 3)
            .execute()
        )
    return response.data or []


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
    return [s.lower() for s in resume_skills]


def _score_job(
    job: dict,
    resume_skills_lower: list[str],
    is_pro: bool,
) -> dict | None:
    try:
        required: list[str] = job.get("skills_required") or []
        if not required:
            hard_score = 50.0
            matched_skills: list[str] = []
        else:
            matched = [s for s in required if s.lower() in resume_skills_lower]
            hard_score = len(matched) / len(required) * 100
            matched_skills = matched

        if is_pro and "similarity" in job:
            semantic_score = job["similarity"] * 100
        else:
            semantic_score = hard_score

        if is_pro:
            final_score = hard_score * 0.4 + semantic_score * 0.6
        else:
            final_score = hard_score

        if final_score >= 70:
            category = "STRONG_FIT"
        elif final_score >= 45:
            category = "GOOD_FIT"
        elif final_score >= 25:
            category = "STRETCH"
        else:
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
            "hard_score": round(hard_score, 1),
            "semantic_score": round(semantic_score, 1),
            "final_score": round(final_score, 1),
            "category": category,
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
    top = scored[:limit]

    strong = sum(1 for j in top if j["category"] == "STRONG_FIT")
    good = sum(1 for j in top if j["category"] == "GOOD_FIT")
    stretch = sum(1 for j in top if j["category"] == "STRETCH")
    logger.info("Matched: %d strong, %d good, %d stretch", strong, good, stretch)

    return top
