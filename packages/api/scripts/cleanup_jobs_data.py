"""
Wipe test jobs / applications / cover_letter_variants before a fresh internship load.

Order respects FKs:
  1. cover_letter_variants (job_id NO ACTION — must clear first)
  2. applications (job_id SET NULL — clear to avoid orphaned test history)
  3. jobs (resume_variants CASCADE)

Usage (from packages/api):
    uv run python scripts/cleanup_jobs_data.py          # dry-run counts
    uv run python scripts/cleanup_jobs_data.py --commit # delete
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

from core.supabase_client import supabase  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("cleanup_jobs_data")

# PostgREST requires a filter on DELETE; match all UUIDs.
_ALL_UUIDS = "id.neq.00000000-0000-0000-0000-000000000000"


def _count(table: str) -> int:
    result = supabase.table(table).select("id", count="exact").execute()
    return result.count or 0


def _count_cover_with_job() -> int:
    result = (
        supabase.table("cover_letter_variants")
        .select("id", count="exact")
        .not_.is_("job_id", "null")
        .execute()
    )
    return result.count or 0


def _delete_all(table: str) -> int:
    """Delete all rows; paginate via repeating delete until empty."""
    deleted = 0
    while True:
        before = _count(table)
        if before == 0:
            break
        supabase.table(table).delete().neq(
            "id", "00000000-0000-0000-0000-000000000000"
        ).execute()
        after = _count(table)
        batch = before - after
        deleted += batch
        logger.info("  %s: deleted batch=%d remaining=%d", table, batch, after)
        if batch == 0:
            # Safety: if filter is blocked / RLS weirdness, stop
            logger.error("Delete made no progress on %s (before=%d)", table, before)
            break
    return deleted


def _delete_cover_letter_variants_with_job() -> int:
    deleted = 0
    while True:
        before = _count_cover_with_job()
        if before == 0:
            break
        supabase.table("cover_letter_variants").delete().not_.is_(
            "job_id", "null"
        ).execute()
        after = _count_cover_with_job()
        batch = before - after
        deleted += batch
        logger.info(
            "  cover_letter_variants(job_id IS NOT NULL): deleted batch=%d remaining=%d",
            batch,
            after,
        )
        if batch == 0:
            logger.error("Delete made no progress on cover_letter_variants")
            break
    return deleted


def main(commit: bool) -> None:
    before = {
        "cover_letter_variants_with_job": _count_cover_with_job(),
        "cover_letter_variants_total": _count("cover_letter_variants"),
        "applications": _count("applications"),
        "jobs": _count("jobs"),
    }
    logger.info("BEFORE: %s", before)

    if not commit:
        logger.info("Dry-run only. Pass --commit to delete.")
        return

    logger.info("1/3 Deleting cover_letter_variants WHERE job_id IS NOT NULL …")
    d1 = _delete_cover_letter_variants_with_job()
    logger.info("2/3 Deleting applications …")
    d2 = _delete_all("applications")
    logger.info("3/3 Deleting jobs …")
    d3 = _delete_all("jobs")

    after = {
        "cover_letter_variants_with_job": _count_cover_with_job(),
        "cover_letter_variants_total": _count("cover_letter_variants"),
        "applications": _count("applications"),
        "jobs": _count("jobs"),
    }
    logger.info(
        "DELETED: cover_letter_variants=%d applications=%d jobs=%d",
        d1,
        d2,
        d3,
    )
    logger.info("AFTER: %s", after)

    if after["applications"] != 0 or after["jobs"] != 0 or after["cover_letter_variants_with_job"] != 0:
        raise SystemExit("Cleanup incomplete — inspect counts above")
    logger.info("Cleanup OK — jobs/applications/cover_letter_variants(job-linked) are empty.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()
    main(commit=args.commit)
