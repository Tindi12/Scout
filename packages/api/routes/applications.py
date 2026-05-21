import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from core.auth import verify_resume_api_user
from core.supabase_client import supabase
from tasks.job_tasks import apply_to_job_task

logger = logging.getLogger(__name__)

router = APIRouter()


class AnswerRequest(BaseModel):
    answer: str = Field(..., min_length=1)


def _fetch_user_row(clerk_id: str) -> dict:
    result = (
        supabase.table("users")
        .select("id, answers_library")
        .eq("clerk_id", clerk_id)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError("user_not_found")
    return result.data


@router.get("/")
async def list_applications(
    current_user: dict = Depends(verify_resume_api_user),
) -> list[dict]:
    clerk_id = current_user["sub"]

    def _fetch() -> list[dict]:
        user_row = (
            supabase.table("users")
            .select("id")
            .eq("clerk_id", clerk_id)
            .single()
            .execute()
        )
        if not user_row.data:
            return []

        user_id = user_row.data["id"]
        result = (
            supabase.table("applications")
            .select(
                "id, user_id, job_id, scout_run_id, status, company, role, "
                "error_message, applied_at, created_at, updated_at, "
                "jobs(title, company, url)"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )

        rows = result.data or []
        normalized: list[dict] = []
        for row in rows:
            job = row.pop("jobs", None) or {}
            if isinstance(job, list) and job:
                job = job[0]
            if not isinstance(job, dict):
                job = {}

            normalized.append({
                **row,
                "company": row.get("company") or job.get("company") or "",
                "role": row.get("role") or job.get("title") or "",
                "job_url": job.get("url") or "",
            })
        return normalized

    return await run_in_threadpool(_fetch)


@router.post("/{application_id}/answer")
async def answer_application(
    application_id: str,
    body: AnswerRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    clerk_id = current_user["sub"]
    answer_text = body.answer.strip()

    def _submit() -> dict:
        user_row = _fetch_user_row(clerk_id)
        user_id = user_row["id"]

        app_result = (
            supabase.table("applications")
            .select("id, user_id, job_id, scout_run_id, status, error_message")
            .eq("id", application_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        app_data = app_result.data
        if not app_data:
            raise ValueError("not_found")

        if app_data.get("status") != "needs_attention":
            raise ValueError("not_awaiting_answer")

        question_key = (app_data.get("error_message") or "").strip() or "application_question"
        library = user_row.get("answers_library") or {}
        if not isinstance(library, dict):
            library = {}
        library[question_key] = answer_text

        supabase.table("users").update({
            "answers_library": library,
        }).eq("id", user_id).execute()

        supabase.table("applications").update({
            "status": "queued",
            "error_message": None,
        }).eq("id", application_id).eq("user_id", user_id).execute()

        scout_run_id = app_data.get("scout_run_id")
        job_id = app_data.get("job_id")
        if scout_run_id and job_id:
            apply_to_job_task.delay(
                scout_run_id=scout_run_id,
                application_id=application_id,
                user_id=user_id,
                job_id=job_id,
            )

        return {"success": True, "application_id": application_id}

    try:
        return await run_in_threadpool(_submit)
    except ValueError as exc:
        code = str(exc)
        if code == "user_not_found":
            raise HTTPException(status_code=404, detail="User not found") from exc
        if code == "not_found":
            raise HTTPException(status_code=404, detail="Application not found") from exc
        if code == "not_awaiting_answer":
            raise HTTPException(
                status_code=422,
                detail="Application is not awaiting an answer",
            ) from exc
        raise
