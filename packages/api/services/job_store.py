import logging

from starlette.concurrency import run_in_threadpool

from core.supabase_client import supabase

logger = logging.getLogger(__name__)

BATCH_SIZE = 500


def _upsert_batch(jobs: list[dict]) -> int:
    supabase.table("jobs").upsert(jobs, on_conflict="url").execute()
    return len(jobs)


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
        return {"upserted": 0, "deleted": 0, "total_in_db": 0}

    upserted = 0
    for i in range(0, len(jobs), BATCH_SIZE):
        batch = jobs[i : i + BATCH_SIZE]
        upserted += await run_in_threadpool(_upsert_batch, batch)

    deleted = await run_in_threadpool(_delete_expired)
    total = await run_in_threadpool(_count_jobs)

    logger.info(
        "store_jobs: upserted=%d deleted=%d total_in_db=%d",
        upserted, deleted, total,
    )
    return {"upserted": upserted, "deleted": deleted, "total_in_db": total}
