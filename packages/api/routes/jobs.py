import logging

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, Query
from starlette.concurrency import run_in_threadpool

from core.auth import verify_clerk_jwt
from core.supabase_client import supabase
from tasks.job_tasks import refresh_jobs_task

logger = logging.getLogger(__name__)

router = APIRouter()


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


