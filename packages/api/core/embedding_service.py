import asyncio
import logging
import os

from dotenv import load_dotenv
from fastapi import HTTPException
from google import genai
from openai import AsyncOpenAI

from core.ai_errors import summarize_gemini_model_error, summarize_provider_error
from core.gemini_client import gemini_client
from core.gemini_models import (
    EMBEDDING_DIMENSION,
    OPENAI_EMBEDDING_MODEL,
    gemini_embedding_chain,
)
from core.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY must be set")

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _clean_text(text: str) -> str:
    return text.strip().replace("\n", " ")[:8000]


def _extract_gemini_embedding_values(response) -> list[float]:
    embeddings = getattr(response, "embeddings", None) or []
    if not embeddings:
        raise ValueError("Gemini returned no embeddings")
    values = getattr(embeddings[0], "values", None)
    if not values:
        raise ValueError("Gemini returned empty embedding")
    return [float(v) for v in values]


async def _embed_with_openai(text: str) -> list[float]:
    response = await openai_client.embeddings.create(
        input=_clean_text(text),
        model=OPENAI_EMBEDDING_MODEL,
    )
    return response.data[0].embedding


async def _embed_with_gemini_model(model: str, text: str) -> list[float]:
    response = await gemini_client.aio.models.embed_content(
        model=model,
        contents=_clean_text(text),
        config=genai.types.EmbedContentConfig(
            output_dimensionality=EMBEDDING_DIMENSION,
        ),
    )
    return _extract_gemini_embedding_values(response)


async def generate_embedding(text: str) -> list[float]:
    try:
        return await _embed_with_openai(text)
    except Exception as openai_exc:
        logger.warning("OpenAI embedding failed: %s", openai_exc)
        openai_issue = summarize_provider_error("OpenAI", openai_exc)
        gemini_issues: list[str] = []

        for model, label in gemini_embedding_chain():
            try:
                embedding = await _embed_with_gemini_model(model, text)
                logger.info("Embedding succeeded with Gemini fallback model %s", model)
                return embedding
            except Exception as exc:
                summary = summarize_gemini_model_error(label, exc)
                gemini_issues.append(summary)
                logger.warning("Gemini embedding %s failed: %s", model, exc)

        detail_lines = [
            "Embedding failed on all providers:",
            f"• {openai_issue}",
            *[f"• {issue}" for issue in gemini_issues],
        ]
        raise HTTPException(status_code=503, detail="\n".join(detail_lines)) from openai_exc


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
