import logging

from starlette.concurrency import run_in_threadpool

from core.embedding_service import embed_jobs_batch
from core.supabase_client import supabase

logger = logging.getLogger(__name__)

BATCH_SIZE = 500
URL_LOOKUP_BATCH_SIZE = 100


def _upsert_batch(jobs: list[dict]) -> int:
    supabase.table("jobs").upsert(jobs, on_conflict="url").execute()
    return len(jobs)


def _fetch_upserted_without_embeddings(all_urls: list[str]) -> list[dict]:
    if not all_urls:
        return []

    results: list[dict] = []
    for i in range(0, len(all_urls), URL_LOOKUP_BATCH_SIZE):
        batch = all_urls[i : i + URL_LOOKUP_BATCH_SIZE]
        response = (
            supabase.table("jobs")
            .select("id, title, company, description")
            .in_("url", batch)
            .is_("embedding", "null")
            .execute()
        )
        results.extend(response.data or [])
    return results


def _delete_expired() -> int:
    try:
        result = supabase.rpc("delete_expired_jobs").execute()
        return result.data if isinstance(result.data, int) else 0
    except Exception as e:
        logger.warning("delete_expired_jobs RPC failed (not yet created?): %s", e)
        return 0


def _count_jobs() -> int:
    result = supabase.table("jobs").select("id", count="exact").execute()
    return result.count or 0


async def store_jobs(jobs: list[dict]) -> dict:
    if not jobs:
        return {"upserted": 0, "deleted": 0, "total_in_db": 0, "embedded": 0, "embed_failed": 0}

    upserted = 0
    all_urls: list[str] = []
    for i in range(0, len(jobs), BATCH_SIZE):
        batch = jobs[i : i + BATCH_SIZE]
        upserted += await run_in_threadpool(_upsert_batch, batch)
        all_urls.extend(j["url"] for j in batch if j.get("url"))

    # Embed only jobs that don't already have an embedding
    needs_embedding = await run_in_threadpool(_fetch_upserted_without_embeddings, all_urls)
    embed_summary = {"embedded": 0, "failed": 0}
    if needs_embedding:
        logger.info("store_jobs: embedding %d new jobs", len(needs_embedding))
        embed_summary = await embed_jobs_batch(needs_embedding)

    deleted = await run_in_threadpool(_delete_expired)
    total = await run_in_threadpool(_count_jobs)

    logger.info(
        "store_jobs: upserted=%d embedded=%d embed_failed=%d deleted=%d total_in_db=%d",
        upserted, embed_summary["embedded"], embed_summary["failed"], deleted, total,
    )
    return {
        "upserted": upserted,
        "deleted": deleted,
        "total_in_db": total,
        "embedded": embed_summary["embedded"],
        "embed_failed": embed_summary["failed"],
    }
