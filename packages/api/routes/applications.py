import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from core.auth import verify_resume_api_user
from core.entitlements import require_paid
from core.subscription import get_tier_limits
from core.redis_client import (
    CANCEL_FLAG_TTL,
    VERIFICATION_CODE_TTL,
    cancel_key,
    get_redis,
    verification_code_key,
)
from core.supabase_client import supabase
from tasks.job_tasks import apply_to_job_task, finalize_run_if_complete
from services.application_credits import refund_application_credits
from services.notification_helpers import notify_application
from services.application_failure_explainer import (
    ensure_user_safe,
    explain_application_failure,
)
from services.application_failure_codes import (
    failure_code_of,
    is_retryable_failure_code,
    user_facing_error_message,
)
from services import notification_service

logger = logging.getLogger(__name__)

router = APIRouter()

# An application can be sent back through the normal apply flow from either
# terminal non-success state. needs_attention became retryable alongside the
# needs-attention UX simplification (2026-07-13): its only prior recovery path
# was a typed free-text answer, which contradicted Scout's autonomous-agent
# premise, so the card is now purely informational with the same Retry action
# a failed card already offers.
_RETRYABLE_STATUSES = ("failed", "needs_attention")


class AnswerRequest(BaseModel):
    answer: str = Field(..., min_length=1)

class VerificationCodeRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=32)

class StopAllResponse(BaseModel):
    stopped: int


class FailureSummaryResponse(BaseModel):
    # Deliberately user-facing only: the raw error_message stays server-side so
    # implementation details never reach the browser.
    kind: str
    summary: str


class RetryResponse(BaseModel):
    success: bool
    application_id: str
    scout_run_id: str


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
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
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
        # Bounded read: never return an unbounded application history in one response.
        # Newest-first with limit/offset so a future UI can page; the default cap keeps
        # the worst case at 200 rows even when the proxy passes no params.
        result = (
            supabase.table("applications")
            .select(
                "id, user_id, job_id, scout_run_id, status, company, role, "
                "error_message, applied_at, created_at, updated_at, "
                "jobs(title, company, url)"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        rows = result.data or []
        # created_at is frozen at the row's ORIGINAL creation and does not move when
        # a retry/re-queue reuses the same row for a new attempt (new scout_run_id,
        # new status, same id) — so it goes stale for any retried application. Every
        # terminal transition creates a notification with its own fresh created_at
        # keyed by the same application_id; prefer that for "how long ago" display.
        # See notification_service.latest_event_by_application.
        latest_events = notification_service.latest_event_by_application(user_id)
        normalized: list[dict] = []
        for row in rows:
            job = row.pop("jobs", None) or {}
            if isinstance(job, list) and job:
                job = job[0]
            if not isinstance(job, dict):
                job = {}

            event = latest_events.get(row["id"])
            raw_error = row.get("error_message")
            normalized.append({
                **row,
                "company": row.get("company") or job.get("company") or "",
                "role": row.get("role") or job.get("title") or "",
                "job_url": job.get("url") or "",
                "status_changed_at": event["created_at"] if event else None,
                # Strip the internal failure-code marker before anything user-facing.
                "error_message": user_facing_error_message(raw_error),
                "failure_code": failure_code_of(raw_error),
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

        question_key = (
            user_facing_error_message(app_data.get("error_message")) or ""
        ).strip() or "application_question"
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


@router.post("/{application_id}/verification-code")
async def submit_verification_code(
    application_id: str,
    body: VerificationCodeRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    """
    Live relay for ATS-emailed verification codes (e.g. Greenhouse's "confirm you're
    human" wall). Unlike /answer, this does NOT re-queue the application — the agent
    is still mid-run, parked in status 'awaiting_code', polling Redis for this code.
    A re-run would just trigger a fresh code email, so the only useful path is
    injecting the code into the live session.
    """
    clerk_id = current_user["sub"]
    code = body.code.strip().replace(" ", "")
    if not code:
        raise HTTPException(status_code=422, detail="Code is empty")

    def _submit() -> dict:
        user_row = _fetch_user_row(clerk_id)
        user_id = user_row["id"]

        app_result = (
            supabase.table("applications")
            .select("id, user_id, status")
            .eq("id", application_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        app_data = app_result.data
        if not app_data:
            raise ValueError("not_found")
        if app_data.get("status") != "awaiting_code":
            raise ValueError("not_awaiting_code")

        get_redis().setex(
            verification_code_key(application_id), VERIFICATION_CODE_TTL, code
        )
        # Flip back to in_progress right away so the tracker shows the agent resuming
        # (the agent's poll would do this too, but only on its next ~3s tick).
        supabase.table("applications").update({
            "status": "in_progress",
            "error_message": None,
        }).eq("id", application_id).eq("user_id", user_id).execute()

        return {"success": True, "application_id": application_id}

    try:
        return await run_in_threadpool(_submit)
    except ValueError as exc:
        error_code = str(exc)
        if error_code == "user_not_found":
            raise HTTPException(status_code=404, detail="User not found") from exc
        if error_code == "not_found":
            raise HTTPException(status_code=404, detail="Application not found") from exc
        if error_code == "not_awaiting_code":
            raise HTTPException(
                status_code=422,
                detail="This application is no longer awaiting a verification code",
            ) from exc
        raise


@router.get("/{application_id}/failure-summary", response_model=FailureSummaryResponse)
async def get_failure_summary(
    application_id: str,
    current_user: dict = Depends(verify_resume_api_user),
) -> FailureSummaryResponse:
    clerk_id = current_user["sub"]

    def _fetch() -> tuple[str, dict]:
        user_row = (
            supabase.table("users")
            .select("id")
            .eq("clerk_id", clerk_id)
            .single()
            .execute()
        )
        if not user_row.data:
            raise ValueError("user_not_found")

        user_id = user_row.data["id"]
        app_result = (
            supabase.table("applications")
            .select("id, user_id, status, company, role, error_message")
            .eq("id", application_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        app_data = app_result.data
        if not app_data:
            raise ValueError("not_found")
        if app_data.get("status") != "failed":
            raise ValueError("not_failed")
        return user_id, app_data

    try:
        user_id, app_data = await run_in_threadpool(_fetch)
    except ValueError as exc:
        error_code = str(exc)
        if error_code == "user_not_found":
            raise HTTPException(status_code=404, detail="User not found") from exc
        if error_code == "not_found":
            raise HTTPException(status_code=404, detail="Application not found") from exc
        if error_code == "not_failed":
            raise HTTPException(
                status_code=422,
                detail="Failure summary is only available for failed applications",
            ) from exc
        raise

    error_message = user_facing_error_message(app_data.get("error_message")) or ""
    kind = "cancelled" if error_message.strip().startswith("cancelled_by_user") else "failed"

    # Fast path: notify_application precomputes this summary at fail-time (see
    # notification_helpers._precomputed_failure_body) specifically so this endpoint
    # — hit on every hover of the outcome chip — never makes a live AI call for any
    # application that failed after that change shipped. Falls through to a live
    # call only for older rows (failed before the precompute existed) or if the
    # precompute write itself failed.
    precomputed = await run_in_threadpool(
        notification_service.latest_notification_body,
        user_id,
        application_id,
        "application_failed",
    )
    if precomputed:
        # Re-guard at read time: rows that failed BEFORE the never-store-raw fix (or
        # any future path that stores an unpolished body) must still not surface a raw
        # run log / verbose dump. ensure_user_safe collapses anything long or containing
        # internal terms to the calm generic summary.
        return FailureSummaryResponse(kind=kind, summary=ensure_user_safe(precomputed))

    result = await explain_application_failure(
        company=app_data.get("company") or "",
        role=app_data.get("role") or "",
        error_message=error_message,
    )
    return FailureSummaryResponse(kind=result["kind"], summary=result["summary"])


@router.post("/{application_id}/retry", response_model=RetryResponse)
async def retry_application(
    application_id: str,
    current_user: dict = Depends(require_paid),
) -> RetryResponse:
    """
    Re-run a failed OR needs_attention application through the normal Scout apply flow.

    The prior attempt's credit was already refunded when it left the active states
    (fail_application_with_refund for failed; the same refund now also runs on the
    needs_attention transition — see job_tasks.py's NeedsAttentionException handler),
    so the retry charges one fresh credit exactly like a new Send Scout — either
    outcome stays net-zero. A NEW scout_run is created for the retry: the original
    run is finalized and its counters are historical; reusing it would double-count.
    """
    clerk_id = current_user["sub"]

    def _retry() -> tuple[str, str, str]:
        user_row = (
            supabase.table("users")
            .select("id, subscription_plan, applications_used")
            .eq("clerk_id", clerk_id)
            .single()
            .execute()
        )
        if not user_row.data:
            raise ValueError("user_not_found")
        user = user_row.data
        user_id = user["id"]

        app_result = (
            supabase.table("applications")
            .select("id, user_id, job_id, status, error_message")
            .eq("id", application_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        app_data = app_result.data
        if not app_data:
            raise ValueError("not_found")
        if app_data.get("status") not in _RETRYABLE_STATUSES:
            raise ValueError("not_retryable_status")
        # Spam/CAPTCHA blocks must not re-enter the automatic apply flow — they
        # reinforce the ATS verdict. Server-side guard even if UI hides the button.
        if not is_retryable_failure_code(failure_code_of(app_data.get("error_message"))):
            raise ValueError("not_retryable_spam")
        job_id = app_data.get("job_id")
        if not job_id:
            raise ValueError("not_retryable")

        limit = get_tier_limits(user.get("subscription_plan"))["application_limit"]
        used = user.get("applications_used") or 0
        if limit - used < 1:
            raise ValueError("no_credits")

        run_resp = (
            supabase.table("scout_runs")
            .insert({
                "user_id": user_id,
                "status": "pending",
                "total_jobs": 1,
                "applied_count": 0,
                "failed_count": 0,
                "needs_attention_count": 0,
            })
            .execute()
        )
        run_rows = run_resp.data if isinstance(run_resp.data, list) else (
            [run_resp.data] if run_resp.data else []
        )
        if not run_rows or "id" not in run_rows[0]:
            raise RuntimeError("run_create_failed")
        run_id = run_rows[0]["id"]

        # Conditional flip guards against a double-click racing two retries (or a
        # retry racing the agent's own concurrent write): only the request that
        # actually transitions failed/needs_attention → queued proceeds.
        flipped = (
            supabase.table("applications")
            .update({
                "status": "queued",
                "error_message": None,
                "scout_run_id": run_id,
                "applied_at": None,
            })
            .eq("id", application_id)
            .eq("user_id", user_id)
            .in_("status", _RETRYABLE_STATUSES)
            .execute()
        )
        if not flipped.data:
            # Lost the race — drop the orphan run we just created.
            supabase.table("scout_runs").delete().eq("id", run_id).execute()
            raise ValueError("not_retryable_status")

        # Charge the retry's credit (the failed attempt was already refunded).
        supabase.table("users").update({
            "applications_used": used + 1,
        }).eq("id", user_id).execute()

        return run_id, user_id, job_id

    try:
        run_id, user_id, job_id = await run_in_threadpool(_retry)
    except ValueError as exc:
        code = str(exc)
        if code == "user_not_found":
            raise HTTPException(status_code=404, detail="User not found") from exc
        if code == "not_found":
            raise HTTPException(status_code=404, detail="Application not found") from exc
        if code == "not_retryable_status":
            raise HTTPException(
                status_code=409,
                detail="This application is not in a retryable state",
            ) from exc
        if code == "not_retryable":
            raise HTTPException(
                status_code=422,
                detail="This application can't be retried automatically",
            ) from exc
        if code == "not_retryable_spam":
            raise HTTPException(
                status_code=422,
                detail=(
                    "This application was blocked by the job site's spam or CAPTCHA "
                    "check. Please apply manually on the employer's page instead."
                ),
            ) from exc
        if code == "no_credits":
            raise HTTPException(
                status_code=403,
                detail="Not enough application credits to retry",
            ) from exc
        raise

    apply_to_job_task.delay(
        scout_run_id=run_id,
        application_id=application_id,
        user_id=user_id,
        job_id=job_id,
    )

    return RetryResponse(
        success=True,
        application_id=application_id,
        scout_run_id=run_id,
    )


@router.post("/stop-all", response_model=StopAllResponse)
async def stop_all_applications(
    current_user: dict = Depends(verify_resume_api_user),
) -> StopAllResponse:
    """
    Stop all active applications for the current user.

    Two signals per application: the row is marked failed/cancelled_by_user (catches
    tasks that have not started yet — the apply task checks it at step 0), and a Redis
    cancel flag is set (catches tasks ALREADY mid-run — the browser agent's watcher
    polls it every few seconds and aborts the live browser session).
    """
    clerk_id = current_user["sub"]

    def _stop() -> StopAllResponse:
        user_row = (
            supabase.table("users")
            .select("id")
            .eq("clerk_id", clerk_id)
            .single()
            .execute()
        )
        if not user_row.data:
            return StopAllResponse(stopped=0)

        user_id = user_row.data["id"]

        # Supabase Python client update doesn't provide affected rowcount consistently across versions.
        # We'll fetch candidate ids first, then update.
        active = (
            supabase.table("applications")
            .select("id")
            .eq("user_id", user_id)
            .in_("status", ["queued", "in_progress", "awaiting_code"])
            .execute()
        )
        ids = [row["id"] for row in (active.data or []) if isinstance(row, dict) and row.get("id")]
        if not ids:
            return StopAllResponse(stopped=0)

        # Capture the affected runs before flipping the apps, so we can finalize them.
        runs_resp = (
            supabase.table("applications")
            .select("scout_run_id")
            .in_("id", ids)
            .execute()
        )
        run_ids = {
            r["scout_run_id"]
            for r in (runs_resp.data or [])
            if isinstance(r, dict) and r.get("scout_run_id")
        }

        # Guard on the active statuses again so a row that raced to a terminal
        # state between the select and this update is neither flipped nor
        # refunded; only the rows actually cancelled here get credits back.
        update_resp = (
            supabase.table("applications")
            .update({
                "status": "failed",
                "error_message": "cancelled_by_user",
            })
            .in_("id", ids)
            .eq("user_id", user_id)
            .in_("status", ["queued", "in_progress", "awaiting_code"])
            .execute()
        )
        flipped_ids = [
            row["id"]
            for row in (update_resp.data or [])
            if isinstance(row, dict) and row.get("id")
        ]
        if flipped_ids:
            refund_application_credits(user_id, len(flipped_ids))
        ids = flipped_ids
        if not ids:
            return StopAllResponse(stopped=0)

        for app_id in ids:
            notify_application(
                user_id,
                app_id,
                "application_failed",
                body_override="cancelled_by_user",
            )

        # Kill switches for runs already in flight: the agent's in-run watcher
        # polls these and calls agent.stop() within seconds.
        try:
            redis_client = get_redis()
            for app_id in ids:
                redis_client.setex(cancel_key(app_id), CANCEL_FLAG_TTL, "1")
        except Exception:
            logger.warning("Could not set stop-all cancel flags", exc_info=True)

        # Finalize any run whose applications are now all terminal — otherwise the run
        # lingers at status='running' and the UI keeps showing it as active.
        for run_id in run_ids:
            finalize_run_if_complete(run_id)

        return StopAllResponse(stopped=len(ids))

    return await run_in_threadpool(_stop)
