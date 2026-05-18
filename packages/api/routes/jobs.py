import json
import logging

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from core.auth import verify_clerk_jwt
from core.embedding_service import embed_resume, generate_embedding
from core.supabase_client import supabase
from services.job_matcher import match_jobs
from tasks.job_tasks import refresh_jobs_task

logger = logging.getLogger(__name__)

router = APIRouter()


class MatchJobsRequest(BaseModel):
    limit: int = 50
    remote_only: bool = False
    visa_friendly_only: bool = False


@router.post("/match")
async def get_job_matches(
    request: MatchJobsRequest,
    current_user: dict = Depends(verify_clerk_jwt),
) -> list[dict]:
    clerk_id = current_user["sub"]

    def _fetch_user() -> dict:
        result = (
            supabase.table("users")
            .select("id, is_pro, requires_sponsorship")
            .eq("clerk_id", clerk_id)
            .single()
            .execute()
        )
        return result.data

    def _fetch_analysis(user_id: str) -> dict:
        result = (
            supabase.table("analyses")
            .select("id, resume_id")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .single()
            .execute()
        )
        return result.data

    def _fetch_resume(resume_id: str) -> dict:
        result = (
            supabase.table("resumes")
            .select("embedding, parsed_content")
            .eq("id", resume_id)
            .single()
            .execute()
        )
        return result.data

    user_row = await run_in_threadpool(_fetch_user)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found.")

    analysis = await run_in_threadpool(_fetch_analysis, user_row["id"])
    if not analysis:
        raise HTTPException(
            status_code=404,
            detail="No resume analysis found. Upload and analyze your resume first.",
        )

    resume = await run_in_threadpool(_fetch_resume, analysis["resume_id"])

    if resume["embedding"] is None:
        text = json.dumps(resume["parsed_content"])[:3000]
        embedding = await generate_embedding(text)
        await embed_resume(analysis["resume_id"], text)
    else:
        embedding = resume["embedding"]

    results = await match_jobs(
        parsed_resume=resume["parsed_content"],
        resume_embedding=embedding,
        is_pro=user_row["is_pro"],
        requires_sponsorship=user_row["requires_sponsorship"],
        limit=request.limit,
    )

    if request.remote_only:
        results = [j for j in results if j.get("remote")]
    if request.visa_friendly_only:
        results = [j for j in results if j.get("visa_sponsorship") != "no"]

    return results


@router.get("/")
async def list_jobs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    source: str | None = None,
    visa_sponsorship: str | None = None,
    remote: bool | None = None,
) -> dict:
    offset = (page - 1) * limit

    def _query() -> dict:
        q = supabase.table("jobs").select("*", count="exact")
        if source:
            q = q.eq("source", source)
        if visa_sponsorship:
            q = q.eq("visa_sponsorship", visa_sponsorship)
        if remote is not None:
            q = q.eq("remote", remote)
        result = q.range(offset, offset + limit - 1).execute()
        return {"jobs": result.data, "total": result.count}

    data = await run_in_threadpool(_query)
    return {
        "jobs": data["jobs"],
        "total": data["total"],
        "page": page,
        "limit": limit,
    }


@router.post("/refresh")
async def refresh_jobs(
    current_user: dict = Depends(verify_clerk_jwt),
) -> dict:
    task = refresh_jobs_task.delay()
    return {
        "status": "queued",
        "task_id": task.id,
        "message": "Job refresh started in background. Check /jobs/status/{task_id} for progress.",
    }


@router.get("/status/{task_id}")
async def job_refresh_status(task_id: str) -> dict:
    result = AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }
