import asyncio
import json
import logging

import sentry_sdk

from core.analytics import EVENT_APPLICATION_COMPLETED, capture
from core.celery_app import celery_app
from core.subscription import is_paid_user
from services.job_fetcher import fetch_all_jobs
from services.job_store import store_jobs
from services.notification_helpers import (
    notify_application,
    notify_scout_run_finished,
)
from datetime import datetime, timezone
from services.portal_detector import detect_portal
from services.latex_generator import generate_resume_pdf, generate_cover_letter_pdf
from services.resume_rewriter import resume_rewriter
from services.cover_letter_writer import cover_letter_writer
from core.redis_client import cancel_key, get_redis
from core.supabase_client import supabase
from core.concurrency import (
    acquire_apply_slots,
    new_slot_token,
    release_apply_slots,
)
from services.browser_agent import browser_agent, resolve_apply_company

logger = logging.getLogger(__name__)


class NeedsAttentionException(Exception):
    """Raised when an application cannot be completed without the user (e.g. a
    CAPTCHA or spam block reported by the agent). The apply task converts this
    to a `needs_attention` status."""

    def __init__(self, question: str):
        self.question = question
        super().__init__(f"Needs user attention: {question}")


def _coerce_parsed(content):
    """resumes.parsed_content is jsonb (dict), but tolerate a JSON string too."""
    if isinstance(content, str):
        try:
            return json.loads(content)
        except Exception:
            return None
    return content or None


def _load_existing_variant(user_id: str, job_id: str) -> dict | None:
    """Return a previously generated per-job tailored resume, if any."""
    try:
        resp = (
            supabase.table("resume_variants")
            .select("rewritten_resume")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows and rows[0].get("rewritten_resume"):
            return rows[0]["rewritten_resume"]
    except Exception as e:
        logger.warning("resume_variants lookup failed for job %s: %s", job_id, e)
    return None


def _generate_job_variant(user_id: str, job_id: str, job_data: dict) -> dict | None:
    """
    Generate a job-tailored resume on demand and cache it in resume_variants.

    Runs inside the apply task so every applied job gets a job-specific resume even
    if the user never opened the tailor dropdown. Returns None (caller falls back to
    the general rewrite) when there is no base resume or no job description to tailor to.
    """
    # Base resume = the user's current resume (is_current), else most recently uploaded,
    # that has parsed content. NOTE: resumes uses uploaded_at / is_current, not created_at.
    try:
        resp = (
            supabase.table("resumes")
            .select("id, parsed_content, is_current, uploaded_at")
            .eq("user_id", user_id)
            .order("is_current", desc=True)
            .order("uploaded_at", desc=True)
            .limit(5)
            .execute()
        )
        resume_rows = resp.data or []
    except Exception as e:
        logger.warning("Tailored resume skipped — base resume load failed: %s", e)
        return None

    resume_id = None
    parsed_content = None
    for row in resume_rows:
        parsed = _coerce_parsed(row.get("parsed_content"))
        if parsed:
            resume_id = row["id"]
            parsed_content = parsed
            break
    if not parsed_content:
        return None

    description = (job_data.get("description") or "").strip()
    if not description:
        # Nothing to tailor against — let the caller use the general rewrite.
        return None
    title = (job_data.get("title") or "Role").strip()
    company = (job_data.get("company") or "Company").strip()
    job_description = f"{title} at {company}\n\n{description}"

    try:
        rewritten = asyncio.run(
            resume_rewriter.jd_specific_rewrite(parsed_content, job_description)
        )
    except Exception as e:
        logger.warning("Tailored resume generation failed for job %s: %s", job_id, e)
        return None
    if not rewritten:
        return None

    # Cache it so a retry / re-run reuses it instead of regenerating.
    try:
        supabase.table("resume_variants").insert({
            "user_id": user_id,
            "resume_id": resume_id,
            "job_id": job_id,
            "rewritten_resume": rewritten,
        }).execute()
    except Exception as e:
        logger.warning("Could not cache tailored variant for job %s (using it anyway): %s", job_id, e)

    logger.info("Generated tailored resume variant for job %s", job_id)
    return rewritten


def _load_latest_general_rewrite(user_id: str) -> dict | None:
    """Fallback: the user's most recent general (non-job-specific) rewrite."""
    try:
        resp = (
            supabase.table("analyses")
            .select("rewritten_resume")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .maybe_single()
            .execute()
        )
        if resp and resp.data:
            return resp.data.get("rewritten_resume")
    except Exception as e:
        logger.warning("analyses fallback lookup failed: %s", e)
    return None


def _cover_letters_enabled(user_data: dict) -> bool:
    """True only for Pro/Scout+ users who turned the cover-letter toggle on."""
    if not user_data.get("generate_cover_letters"):
        return False
    return is_paid_user(user_data.get("subscription_plan"))


def _cover_letter_applicant(user_data: dict) -> dict:
    """Header/signature fields for the cover-letter PDF (never AI-written)."""
    return {
        "name": user_data.get("name") or "",
        "email": user_data.get("email") or "",
        "phone": user_data.get("phone_number") or "",
        "city": user_data.get("address_city") or "",
        "state": user_data.get("address_state") or "",
        "linkedin": user_data.get("linkedin_url") or "",
        "company": user_data.get("company") or "",
        "date": datetime.now(timezone.utc).strftime("%B %d, %Y"),
    }


def _load_existing_cover_letter(user_id: str, job_id: str) -> dict | None:
    """Return a previously generated per-job cover letter, if any."""
    try:
        resp = (
            supabase.table("cover_letter_variants")
            .select("cover_letter")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows and rows[0].get("cover_letter"):
            return rows[0]["cover_letter"]
    except Exception as e:
        logger.warning("cover_letter_variants lookup failed for job %s: %s", job_id, e)
    return None


def _generate_cover_letter(
    user_id: str, job_id: str, job_data: dict, resume_json: dict, user_data: dict
) -> dict | None:
    """Generate a tailored cover letter on demand and cache it. Returns None on failure."""
    try:
        letter = asyncio.run(
            cover_letter_writer.generate(
                user_data=user_data, resume=resume_json, job=job_data
            )
        )
    except Exception as e:
        logger.warning("Cover letter generation failed for job %s: %s", job_id, e)
        return None
    if not letter:
        return None

    try:
        supabase.table("cover_letter_variants").insert({
            "user_id": user_id,
            "job_id": job_id,
            "cover_letter": letter,
        }).execute()
    except Exception as e:
        logger.warning("Could not cache cover letter for job %s (using it anyway): %s", job_id, e)

    logger.info("Generated cover letter for job %s", job_id)
    return letter


@celery_app.task(name="tasks.refresh_jobs")
def refresh_jobs_task() -> dict:
    logger.info("refresh_jobs_task: starting")
    jobs = asyncio.run(fetch_all_jobs())
    result = asyncio.run(store_jobs(jobs))
    logger.info("refresh_jobs_task: done — %s", result)
    return result


def finalize_run_if_complete(scout_run_id: str) -> None:
    """
    Mark a scout_run terminal once all of its applications are terminal.

    Idempotent; safe to call from the apply task or the stop-all route. Without it,
    runs linger at status='running' forever (the UI derives "active" from run.status),
    which is what pushed users to hit Stop-all — and the cancel then masked the real
    per-application error.
    """
    apps = (
        supabase.table("applications")
        .select("status")
        .eq("scout_run_id", scout_run_id)
        .execute()
    )
    rows = apps.data or []
    if not rows:
        return
    terminal_states = {"applied", "failed", "needs_attention"}
    if not all(a.get("status") in terminal_states for a in rows):
        return
    applied = sum(1 for a in rows if a.get("status") == "applied")
    supabase.table("scout_runs").update({
        "status": "completed" if applied > 0 else "failed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", scout_run_id).execute()
    logger.info(
        "Scout run %s finalized as %s",
        scout_run_id,
        "completed" if applied > 0 else "failed",
    )
    notify_scout_run_finished(scout_run_id)


@celery_app.task(name="tasks.apply_to_job", bind=True, max_retries=2, default_retry_delay=30, soft_time_limit=900, time_limit=960)
def apply_to_job_task(self, scout_run_id: str, application_id: str, user_id: str, job_id: str) -> dict:
    SESSION_LOSS_BACKOFF_SECONDS = 180
    # Hard wall-clock budget for one apply attempt (the full agent pipeline),
    # enforced inside asyncio because Celery's enforcement is dead on the Windows dev
    # worker: soft_time_limit needs signals and time_limit needs pool kill support —
    # --pool=solo has neither (a hung pipeline once ran 12 min and only died via
    # cold-shutdown's "TaskPool does not implement kill_job"). Kept below
    # soft_time_limit=900 so on Linux prefork this still fires first and takes the
    # clean browser_session_lost retry path instead of SoftTimeLimitExceeded.
    # Budget ladder: agent run cap 840 < this 870 < soft 900 < hard 960 < Browserbase
    # session 1260. Sized to allow ~6 min of awaiting_code (verification-code relay).
    APPLY_PIPELINE_TIMEOUT = 870
    # Short backoff before re-checking for a free concurrency slot (see below).
    SLOT_THROTTLE_BACKOFF_SECONDS = 20

    # 0. Honor stop-all / cancellation BEFORE taking a concurrency slot, so a
    #    cancelled application never consumes capacity (or bounces on the throttle).
    try:
        current = (
            supabase.table("applications")
            .select("status, error_message")
            .eq("id", application_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if current and current.data:
            status = current.data.get("status")
            if status == "failed" and current.data.get("error_message") == "cancelled_by_user":
                # A cancelled app is terminal — close the run if everything else is done too.
                finalize_run_if_complete(scout_run_id)
                return {"success": False, "cancelled": True, "application_id": application_id}
    except Exception as e:
        # A transient read error here shouldn't strand the application — fall through
        # and let the main pipeline (with its own error handling) run. Capture as a
        # warning so a chronically failing pre-check is still visible.
        sentry_sdk.capture_exception(e, level="warning")
        logger.warning("apply_to_job_task pre-cancel check failed (app %s): %s", application_id, e)

    # Acquire a global + per-user concurrency slot BEFORE creating the Browserbase
    # session. If the fleet (or this user) is at capacity, re-queue a FRESH task with a
    # short backoff instead of busy-looping or failing. A fresh apply_async (not
    # self.retry) is used deliberately: backpressure re-queues must NOT consume the
    # max_retries budget the session-loss path depends on. The slot is released in the
    # finally below on every exit path — success, exception, retry, or worker death
    # (TTL backstop). Per-task isolation (own session, own agent) is untouched.
    slot_token = new_slot_token()
    if not acquire_apply_slots(user_id, slot_token):
        logger.info(
            "apply_to_job_task throttled — no concurrency slot (app %s, user %s); "
            "re-queueing in %ss",
            application_id, user_id, SLOT_THROTTLE_BACKOFF_SECONDS,
        )
        apply_to_job_task.apply_async(
            kwargs={
                "scout_run_id": scout_run_id,
                "application_id": application_id,
                "user_id": user_id,
                "job_id": job_id,
            },
            countdown=SLOT_THROTTLE_BACKOFF_SECONDS,
        )
        return {"success": False, "throttled": True, "application_id": application_id}

    try:
        # 0.5. Clear any stale stop-all flag from an earlier cancellation, so a
        # re-queued application (Submit & Retry) isn't instantly killed by it.
        # A CURRENT stop-all is still honored: it flips the row to failed/
        # cancelled_by_user first, which the step-0 check above catches.
        try:
            get_redis().delete(cancel_key(application_id))
        except Exception:
            pass

        # 1. Update application status → "in_progress"
        supabase.table("applications").update({"status": "in_progress"}).eq("id", application_id).execute()
        # 2. Update scout_run → increment in_progress count
        supabase.table("scout_runs").update({"status": "running"}).eq("id", scout_run_id).execute()
        # 3. Fetch user profile from Supabase
        user_profile = supabase.table("users").select("*").eq("id", user_id).single().execute()

        user_data = user_profile.data
        if not user_data:
            raise Exception("User not found")

        # 4. Fetch job from Supabase
        job = supabase.table("jobs").select("title, company, url, portal, description").eq("id", job_id).single().execute()

        job_data = job.data
        if not job_data:
            raise Exception("Job not found")

        job_url = job_data.get("url") or ""
        # Persist the target URL on the application so a failure is diagnosable
        # (which job / which ATS) and the tracker can deep-link. Was always null before.
        if job_url:
            supabase.table("applications").update({"url": job_url}).eq("id", application_id).execute()

        # 5. Resolve the resume to submit, TAILORED to this job.
        #    Priority: existing per-job variant → generate one now → latest general rewrite.
        #    Generation is lazy/per-job here so every applied job gets a job-specific
        #    resume even when the user never opened the tailor dropdown before sending.
        resume_to_use = _load_existing_variant(user_id, job_id)
        if not resume_to_use:
            resume_to_use = _generate_job_variant(user_id, job_id, job_data)
        if not resume_to_use:
            resume_to_use = _load_latest_general_rewrite(user_id)

        # 5.5. Generate PDF from resume variant
        if resume_to_use:
            resume_pdf = generate_resume_pdf(resume_to_use)
        else:
            raise Exception("No resume available to submit")

        #6. Detect portal from job.portal field
        portal = detect_portal(url=job_url, portal=job_data.get("portal", "unknown"))

        user_data = {
            **user_data,
            "company": resolve_apply_company(
                job_url=job_url,
                job_company=job_data.get("company"),
            ),
            "job_title": job_data.get("title") or user_data.get("job_title") or "",
        }

        # 6.5. Cover letter (Pro/Scout+ + toggle on): reuse cache → generate → none.
        #      Pre-generated here so the PDF is ready when the form has a CL field;
        #      a failure anywhere just drops the cover letter (apply proceeds with the
        #      resume only — the agent path is unchanged when cover_letter_pdf is None).
        cover_letter_pdf = None
        if _cover_letters_enabled(user_data) and resume_to_use:
            letter = _load_existing_cover_letter(user_id, job_id)
            if not letter:
                letter = _generate_cover_letter(
                    user_id, job_id, job_data, resume_to_use, user_data
                )
            if letter:
                try:
                    cover_letter_pdf = generate_cover_letter_pdf(
                        letter, _cover_letter_applicant(user_data)
                    )
                except Exception as e:
                    logger.warning(
                        "Cover letter PDF generation failed for job %s (skipping CL): %s",
                        job_id, e,
                    )
                    cover_letter_pdf = None

        #7. Apply via the AI browser agent (agent-only — the per-ATS Playwright
        #   adapters were removed for full agentic focus).
        #   On deadline, wait_for cancels the pipeline; browser_agent's finally block
        #   still REST-releases the Browserbase session (sync call, uncancellable).
        logger.info("Applying via AI agent (portal=%s): %s", portal, job_url)
        try:
            result = asyncio.run(
                asyncio.wait_for(
                    browser_agent.apply(
                        job_url=job_url,
                        user_data=user_data,
                        resume_pdf=resume_pdf,
                        application_id=application_id,
                        cover_letter_pdf=cover_letter_pdf,
                    ),
                    timeout=APPLY_PIPELINE_TIMEOUT,
                )
            )
        except TimeoutError as deadline_exc:  # asyncio.TimeoutError is this builtin on 3.11+
            raise Exception(
                f"browser_session_lost: apply pipeline exceeded {APPLY_PIPELINE_TIMEOUT}s hard deadline"
            ) from deadline_exc
        if result.get("needs_attention"):
            raise NeedsAttentionException(result.get("attention_question"))
        if not result.get("success"):
            error_code = result.get("error_code")
            error_message = result.get("error") or "Browser application failed"
            if error_code:
                raise Exception(f"{error_code}: {error_message}")
            raise Exception(error_message)

        #8. Update application status → "applied"
        supabase.table("applications").update({"status": "applied", "applied_at": datetime.now(timezone.utc).isoformat()}).eq("id", application_id).execute()

        #9. Update scout_run → increment applied_count
        supabase.rpc("increment_scout_run_counter", {"run_id": scout_run_id, "counter_name": "applied_count"}).execute()

        notify_application(user_id, application_id, "application_applied", scout_run_id=scout_run_id)

        # Accuracy-critical funnel event: fire ONLY now that the application truly
        # reached "applied" (never from optimistic UI). Keyed by the user's Clerk id so
        # it stitches to the browser-side funnel. Portal is a useful non-PII dimension.
        capture(
            user_data.get("clerk_id"),
            EVENT_APPLICATION_COMPLETED,
            {"portal": portal},
            flush=True,
        )

        finalize_run_if_complete(scout_run_id)

    except NeedsAttentionException as e:
        supabase.table("applications").update({
            "status": "needs_attention",
            "error_message": str(e)
        }).eq("id", application_id).execute()
        supabase.rpc("increment_scout_run_counter", {
            "run_id": scout_run_id,
            "counter_name": "needs_attention_count"
        }).execute()
        notify_application(
            user_id,
            application_id,
            "application_needs_attention",
            scout_run_id=scout_run_id,
            body_override=str(e),
        )
        finalize_run_if_complete(scout_run_id)
        return {
            "success": False,
            "needs_attention": True,
            "question": str(e)
        }

    except Exception as e:
        # Fall back to the class name so blank-message errors (e.g. SoftTimeLimitExceeded
        # from a spinning run) still record SOMETHING instead of an empty string.
        err_text = str(e) or e.__class__.__name__
        logger.error("apply_to_job_task failed (app %s): %s", application_id, err_text)

        if err_text.startswith("cancelled_by_user"):
            # Do not retry cancellations; the app is already failed/cancelled_by_user.
            finalize_run_if_complete(scout_run_id)
            return {"success": False, "cancelled": True, "application_id": application_id}

        # Browser session loss is transient infra — retry with backoff WHILE retries
        # remain. Once exhausted, record a terminal failure and finalize; otherwise the
        # app sticks at 'queued' and the run never closes.
        if err_text.startswith("browser_session_lost:"):
            if self.request.retries < self.max_retries:
                # Transient infra — don't capture every retry (noise). Leave a
                # breadcrumb so the eventual terminal event has the retry history.
                sentry_sdk.add_breadcrumb(
                    category="apply",
                    level="warning",
                    message="browser_session_lost; retrying",
                    data={"retries": self.request.retries, "application_id": application_id},
                )
                supabase.table("applications").update({
                    "status": "queued",
                    "error_message": "Temporary browser session issue. Retrying...",
                }).eq("id", application_id).execute()
                supabase.table("scout_runs").update({"status": "running"}).eq("id", scout_run_id).execute()
                raise self.retry(exc=e, countdown=SESSION_LOSS_BACKOFF_SECONDS)
            # Retries exhausted — this is now a terminal failure worth seeing in Sentry.
            sentry_sdk.set_tag("apply_failure", "session_loss_exhausted")
            sentry_sdk.capture_exception(e)
            supabase.table("applications").update({
                "status": "failed",
                "error_message": f"browser_session_lost (gave up after {self.request.retries} retries): {err_text[:300]}",
            }).eq("id", application_id).execute()
            supabase.rpc("increment_scout_run_counter", {"run_id": scout_run_id, "counter_name": "failed_count"}).execute()
            notify_application(user_id, application_id, "application_failed", scout_run_id=scout_run_id)
            finalize_run_if_complete(scout_run_id)
            return {"success": False, "error": "session_loss_exhausted", "application_id": application_id}

        error_str = err_text.lower()
        if any(x in error_str for x in ("402", "payment required", "quota", "billing")):
            logger.error("Billing/quota error — not retrying: %s", err_text)
            # Not a bug, but we want visibility when provider quotas/billing start
            # biting in production — capture at warning level (not error-flooding).
            sentry_sdk.capture_message(
                f"apply billing/quota limit hit: {err_text[:200]}", level="warning"
            )
            supabase.table("applications").update({
                "status": "failed",
                "error_message": f"Service limit reached: {err_text[:200]}",
            }).eq("id", application_id).execute()
            supabase.rpc("increment_scout_run_counter", {
                "run_id": scout_run_id,
                "counter_name": "failed_count",
            }).execute()
            notify_application(user_id, application_id, "application_failed", scout_run_id=scout_run_id)
            finalize_run_if_complete(scout_run_id)
            return {"success": False, "error": "billing_limit"}

        # Everything else is a DETERMINISTIC failure (agent couldn't complete the form,
        # no resume, etc.). Do NOT retry: a retry just spins again for minutes and flips
        # the run back to 'running', stretching the UI's "running" state and pushing users
        # to Stop-all — which is what masked this very error_message. Record and finalize.
        # Swallowed by design (graceful DB record + return), so capture it explicitly —
        # these agent failures are the most important errors to see in production.
        sentry_sdk.set_tag("apply_failure", "deterministic")
        sentry_sdk.capture_exception(e)
        supabase.table("applications").update({
            "status": "failed",
            "error_message": err_text[:1000],
        }).eq("id", application_id).execute()
        supabase.rpc("increment_scout_run_counter", {"run_id": scout_run_id, "counter_name": "failed_count"}).execute()
        notify_application(user_id, application_id, "application_failed", scout_run_id=scout_run_id)
        finalize_run_if_complete(scout_run_id)
        return {"success": False, "error": err_text[:300], "application_id": application_id}

    finally:
        # Release the concurrency slot on EVERY exit path: success, the NeedsAttention/
        # exception returns above, and `raise self.retry(...)` (the slot is freed now;
        # the retried attempt re-acquires later). The Redis TTL backstops a worker that
        # dies before reaching here. No leaked slots.
        release_apply_slots(user_id, slot_token)

    return {"success": True, "application_id": application_id, "scout_run_id": scout_run_id}
