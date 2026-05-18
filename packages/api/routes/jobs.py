import logging

from fastapi import APIRouter, Depends, Query
from starlette.concurrency import run_in_threadpool

from core.auth import verify_clerk_jwt
from core.supabase_client import supabase
from services.job_fetcher import fetch_all_jobs
from services.job_store import store_jobs

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
    jobs = await fetch_all_jobs()
    summary = await store_jobs(jobs)
    return summary


# REMOVE BEFORE PROD
@router.get("/refresh-test")
async def refresh_jobs_test() -> dict:
    jobs = await fetch_all_jobs()
    summary = await store_jobs(jobs)
    return summary
