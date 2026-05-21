import asyncio
import logging

from core.celery_app import celery_app
from services.job_fetcher import fetch_all_jobs
from services.job_store import store_jobs
from core.supabase_client import supabase
from datetime import datetime, timezone
from services.portal_detector import detect_portal
from services.latex_generator import generate_resume_pdf
from services.mcp.greenhouse import GreenhouseMCP, NeedsAttentionException
from services.mcp.lever import LeverMCP
from services.mcp.ashby import AshbyMCP
from services.mcp.usajobs import USAJobsMCP

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

        # 5. Fetch resume variant for this job
        variant = supabase.table("resume_variants").select("rewritten_resume").eq("user_id", user_id).eq("job_id", job_id).single().execute()

        if variant.data:
            resume_to_use = variant.data["rewritten_resume"]
        else:
            # Fall back to latest analysis rewritten_resume
            analysis = supabase.table("analyses").select("rewritten_resume").eq("user_id", user_id).order("created_at", desc=True).limit(1).single().execute()

            resume_to_use = analysis.data["rewritten_resume"] if analysis.data else None

        # 5.5. Generate PDF from resume variant
        if resume_to_use:
            resume_pdf = generate_resume_pdf(resume_to_use)
        else:
            raise Exception("No resume available to submit")

        #6. Detect portal from job.portal field
        portal = detect_portal(url=job_data.get("url", ""), portal=job_data.get("portal", "unknown"))

        #7. Call appropriate MCP/browser handler
        logger.info(f"Applying to {job_data['title']} at {job_data['company']} via {portal}")
        if portal == "greenhouse":
            mcp = GreenhouseMCP()
            result = asyncio.get_event_loop().run_until_complete(
                mcp.apply(
                    job_url=job_data["url"],
                    user_data=user_data,
                    resume_pdf=resume_pdf,
                )
            )
        elif portal == "lever":
            mcp = LeverMCP()
            result = asyncio.get_event_loop().run_until_complete(
                mcp.apply(
                    job_url=job_data["url"],
                    user_data=user_data,
                    resume_pdf=resume_pdf,
                )
            )
        elif portal == "ashby":
            mcp = AshbyMCP()
            result = asyncio.get_event_loop().run_until_complete(
                mcp.apply(
                    job_url=job_data["url"],
                    user_data=user_data,
                    resume_pdf=resume_pdf,
                )
            )
        elif portal == "usajobs":
            mcp = USAJobsMCP()
            result = asyncio.get_event_loop().run_until_complete(
                mcp.apply(
                    job_url=job_data["url"],
                    user_data=user_data,
                    resume_pdf=resume_pdf,
                )
            )
        else:
            logger.info(f"Portal {portal} not yet implemented")
            result = {"success": True, "stub": True}

        #8. Update application status → "applied"
        supabase.table("applications").update({"status": "applied", "applied_at": datetime.now(timezone.utc).isoformat()}).eq("id", application_id).execute()

        #9. Update scout_run → increment applied_count
        supabase.rpc("increment_scout_run_counter", {"run_id": scout_run_id, "counter_name": "applied_count"}).execute()

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
        raise self.retry(exc=e)

    return {"success": True, "application_id": application_id, "scout_run_id": scout_run_id}