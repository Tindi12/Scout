import asyncio
import logging

from core.celery_app import celery_app
from services.job_fetcher import fetch_all_jobs
from services.job_store import store_jobs
from core.supabase_client import supabase
from datetime import datetime, timezone
from services.portal_detector import detect_portal
from services.latex_generator import generate_resume_pdf
from services.mcp.greenhouse import NeedsAttentionException
from services.browser_agent import browser_agent

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.refresh_jobs")
def refresh_jobs_task() -> dict:
    logger.info("refresh_jobs_task: starting")
    jobs = asyncio.run(fetch_all_jobs())
    result = asyncio.run(store_jobs(jobs))
    logger.info("refresh_jobs_task: done — %s", result)
    return result


@celery_app.task(name="tasks.apply_to_job", bind=True, max_retries=2, default_retry_delay=30, soft_time_limit=300, time_limit=360)
def apply_to_job_task(self, scout_run_id: str, application_id: str, user_id: str, job_id: str) -> dict:
    def _check_and_complete_run():
        apps = supabase.table("applications")\
            .select("status")\
            .eq("scout_run_id", scout_run_id)\
            .execute()

        if not apps.data:
            return

        terminal_states = {"applied", "failed", "needs_attention"}
        all_done = all(
            app["status"] in terminal_states
            for app in apps.data
        )

        if all_done:
            applied = sum(
                1 for a in apps.data
                if a["status"] == "applied"
            )
            supabase.table("scout_runs").update({
                "status": "completed" if applied > 0 else "failed",
                "completed_at": datetime.now(
                    timezone.utc
                ).isoformat()
            }).eq("id", scout_run_id).execute()
            logger.info(
                f"Scout run {scout_run_id} completed"
            )

    try:
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

        # 5. Fetch resume variant for this job (maybe_single can return None response)
        resume_to_use = None
        try:
            variant_response = (
                supabase.table("resume_variants")
                .select("rewritten_resume")
                .eq("user_id", user_id)
                .eq("job_id", job_id)
                .maybe_single()
                .execute()
            )
            if variant_response and variant_response.data:
                resume_to_use = variant_response.data["rewritten_resume"]
        except Exception:
            resume_to_use = None

        if not resume_to_use:
            try:
                analysis_response = (
                    supabase.table("analyses")
                    .select("rewritten_resume")
                    .eq("user_id", user_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .maybe_single()
                    .execute()
                )
                if analysis_response and analysis_response.data:
                    resume_to_use = analysis_response.data["rewritten_resume"]
            except Exception:
                resume_to_use = None

        # 5.5. Generate PDF from resume variant
        if resume_to_use:
            resume_pdf = generate_resume_pdf(resume_to_use)
        else:
            raise Exception("No resume available to submit")

        #6. Detect portal from job.portal field
        portal = detect_portal(url=job_data.get("url", ""), portal=job_data.get("portal", "unknown"))

        #7. Apply via BrowserUseAgent
        result = asyncio.run(browser_agent.apply(job_url=job_data.get("url"), user_data=user_data, resume_pdf=resume_pdf))
        if result.get("needs_attention"):
            raise NeedsAttentionException(result.get("attention_question"))
        if not result.get("success"):
            raise Exception(result.get("error") or "Browser application failed")

        #8. Update application status → "applied"
        supabase.table("applications").update({"status": "applied", "applied_at": datetime.now(timezone.utc).isoformat()}).eq("id", application_id).execute()

        #9. Update scout_run → increment applied_count
        supabase.rpc("increment_scout_run_counter", {"run_id": scout_run_id, "counter_name": "applied_count"}).execute()

        _check_and_complete_run()

    except NeedsAttentionException as e:
        supabase.table("applications").update({
            "status": "needs_attention",
            "error_message": str(e)
        }).eq("id", application_id).execute()
        supabase.rpc("increment_scout_run_counter", {
            "run_id": scout_run_id,
            "counter_name": "needs_attention_count"
        }).execute()
        return {
            "success": False,
            "needs_attention": True,
            "question": str(e)
        }

    except Exception as e:
        logger.error(f"apply_to_job_task failed: {e}")
        #10. If any exception:
        #    Update application → "failed"
        supabase.table("applications").update({"status": "failed", "error_message": str(e)}).eq("id", application_id).execute()
        #    Update scout_run → increment failed_count
        supabase.rpc("increment_scout_run_counter", {"run_id": scout_run_id, "counter_name": "failed_count"}).execute()
        _check_and_complete_run()
        raise self.retry(exc=e)

    return {"success": True, "application_id": application_id, "scout_run_id": scout_run_id}
