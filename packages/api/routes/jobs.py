import json
import logging

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from core.auth import verify_clerk_jwt, verify_resume_api_user
from core.embedding_service import embed_resume, generate_embedding
from core.entitlements import require_paid
from core.subscription import get_tier_limits
from core.supabase_client import supabase
from services.job_matcher import match_jobs
from tasks.job_tasks import apply_to_job_task, refresh_jobs_task

logger = logging.getLogger(__name__)

router = APIRouter()


class MatchJobsRequest(BaseModel):
    limit: int = 50
    remote_only: bool = False
    visa_friendly_only: bool = False

class ScoutRunRequest(BaseModel):
    job_ids: list[str]

@router.post("/match")
async def get_job_matches(
    request: MatchJobsRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> list[dict]:
    clerk_id = current_user["sub"]

    def _fetch_user() -> dict:
        result = (
            supabase.table("users")
            .select("id, subscription_plan, requires_sponsorship, target_roles")
            .eq("clerk_id", clerk_id)
            .single()
            .execute()
        )
        return result.data

    def _fetch_analysis(user_id: str) -> dict:
        result = (
            supabase.table("analyses")
            .select("id, resume_id, score, target_role")
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

    target_roles = user_row.get("target_roles") or []
    if not isinstance(target_roles, list):
        target_roles = []

    results = await match_jobs(
        parsed_resume=resume["parsed_content"],
        resume_embedding=embedding,
        plan=user_row["subscription_plan"],
        requires_sponsorship=user_row["requires_sponsorship"],
        limit=request.limit,
        user_id=user_row["id"],
        target_role_ids=[str(r) for r in target_roles if r],
        target_role_label=analysis.get("target_role"),
        resume_quality_score=analysis.get("score"),
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


@router.post("/scout/run")
async def start_scout_run(
    request: ScoutRunRequest,
    current_user: dict = Depends(require_paid),
) -> dict:
    clerk_id = current_user["sub"]

    def _fetch_user() -> dict | None:
        result = (
            supabase.table("users")
            .select("*")
            .eq("clerk_id", clerk_id)
            .single()
            .execute()
        )
        return result.data

    user_data = await run_in_threadpool(_fetch_user)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    # Cap is derived from the live subscription_plan via the central tier helper — the
    # single source of truth — so an upgrade takes effect immediately. (The stored
    # users.applications_limit column is not used for enforcement; it can lag a tier
    # change since the webhook only updates subscription_plan.)
    limit = get_tier_limits(user_data.get("subscription_plan"))["application_limit"]
    remaining = limit - user_data["applications_used"]
    if remaining < len(request.job_ids):
        raise HTTPException(
            status_code=403,
            detail=f"Not enough credits. {remaining} remaining.",
        )

    def _create_run_and_applications() -> tuple[str, list[tuple[str, str]]]:
        scout_run = (
            supabase.table("scout_runs")
            .insert({
                "user_id": user_data["id"],
                "status": "pending",
                "total_jobs": len(request.job_ids),
                "applied_count": 0,
                "failed_count": 0,
                "needs_attention_count": 0,
            })
            .execute()
        )
        run_rows = scout_run.data if isinstance(scout_run.data, list) else (
            [scout_run.data] if scout_run.data else []
        )
        if not run_rows or "id" not in run_rows[0]:
            raise HTTPException(status_code=500, detail="Failed to create scout run")
        run_id = run_rows[0]["id"]

        created: list[tuple[str, str]] = []
        for job_id in request.job_ids:
            job_details = (
                supabase.table("jobs")
                .select("title, company")
                .eq("id", job_id)
                .single()
                .execute()
            )
            application = (
                supabase.table("applications")
                .insert({
                    "user_id": user_data["id"],
                    "job_id": job_id,
                    "scout_run_id": run_id,
                    "status": "queued",
                    "company": job_details.data["company"] if job_details.data else "",
                    "role": job_details.data["title"] if job_details.data else "",
                })
                .execute()
            )
            app_rows = application.data if isinstance(application.data, list) else (
                [application.data] if application.data else []
            )
            if not app_rows or "id" not in app_rows[0]:
                raise HTTPException(status_code=500, detail="Failed to create application")
            created.append((app_rows[0]["id"], job_id))

        return run_id, created

    run_id, created = await run_in_threadpool(_create_run_and_applications)

    for application_id, job_id in created:
        apply_to_job_task.delay(
            scout_run_id=run_id,
            application_id=application_id,
            user_id=user_data["id"],
            job_id=job_id,
        )

    def _increment_applications_used() -> None:
        supabase.table("users").update({
            "applications_used": user_data["applications_used"] + len(request.job_ids),
        }).eq("id", user_data["id"]).execute()

    await run_in_threadpool(_increment_applications_used)

    return {
        "scout_run_id": run_id,
        "queued": len(request.job_ids),
        "status": "pending",
    }

@router.get("/scout/runs/{run_id}")
async def get_scout_run(
    run_id: str,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    clerk_id = current_user["sub"]

    def _fetch_user() -> dict | None:
        result = (
            supabase.table("users")
            .select("id")
            .eq("clerk_id", clerk_id)
            .single()
            .execute()
        )
        return result.data

    user_data = await run_in_threadpool(_fetch_user)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    def _fetch_scout_run() -> dict | None:
        result = (
            supabase.table("scout_runs")
            .select("*, applications(*)")
            .eq("id", run_id)
            .eq("user_id", user_data["id"])
            .maybe_single()
            .execute()
        )
        return result.data

    run_data = await run_in_threadpool(_fetch_scout_run)
    if not run_data:
        raise HTTPException(status_code=404, detail="Scout run not found")

    return run_data