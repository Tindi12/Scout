import asyncio
import logging
import os

from dotenv import load_dotenv
from fastapi import HTTPException
from openai import AsyncOpenAI

from core.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY must be set")

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

MODEL = "text-embedding-ada-002"


def _clean_text(text: str) -> str:
    return text.strip().replace("\n", " ")[:8000]


async def generate_embedding(text: str) -> list[float]:
    try:
        response = await openai_client.embeddings.create(
            input=_clean_text(text),
            model=MODEL,
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error("generate_embedding failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {e}")


async def embed_job(job_id: str, text: str) -> bool:
    try:
        embedding = await generate_embedding(text)
        await asyncio.to_thread(
            lambda: supabase.table("jobs")
            .update({"embedding": embedding})
            .eq("id", job_id)
            .execute()
        )
        return True
    except Exception as e:
        logger.error("embed_job failed for job_id=%s: %s", job_id, e)
        return False


async def embed_resume(resume_id: str, text: str) -> bool:
    try:
        embedding = await generate_embedding(text)
        await asyncio.to_thread(
            lambda: supabase.table("resumes")
            .update({"embedding": embedding})
            .eq("id", resume_id)
            .execute()
        )
        return True
    except Exception as e:
        logger.error("embed_resume failed for resume_id=%s: %s", resume_id, e)
        return False


async def embed_jobs_batch(jobs: list[dict]) -> dict:
    success = 0
    failed = 0
    total = len(jobs)

    for i, job in enumerate(jobs):
        text = f"{job.get('title', '')} {job.get('company', '')} {job.get('description', '')[:500]}"
        ok = await embed_job(job["id"], text)
        if ok:
            success += 1
        else:
            failed += 1

        if (i + 1) % 100 == 0:
            logger.info("Embedded %d/%d jobs...", i + 1, total)

        await asyncio.sleep(0.1)

    logger.info("embed_jobs_batch complete: embedded=%d failed=%d", success, failed)
    return {"embedded": success, "failed": failed}
