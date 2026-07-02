"""
One-time migration: encrypt any plaintext users.usajobs_password values in place.

Reversible (Fernet) — see core/crypto.py. Idempotent: already-encrypted rows are
skipped, so it is safe to re-run. Dry-run by default; pass --commit to write.

NEVER prints the password plaintext or ciphertext — only row ids and counts.

Requires USAJOBS_ENC_KEY in the environment (same key the app uses). Runs against
whatever SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY the environment points at.

Usage (from packages/api):
    uv run python scripts/migrate_usajobs_password_encrypt.py          # dry run
    uv run python scripts/migrate_usajobs_password_encrypt.py --commit # apply
"""
import argparse
import logging
import sys
from pathlib import Path

# Allow `uv run python scripts/migrate_usajobs_password_encrypt.py` from packages/api:
# when invoked by path, sys.path[0] is this scripts/ dir, so add the api root so
# `core` resolves.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.crypto import encrypt_usajobs_password, is_encrypted  # noqa: E402
from core.supabase_client import supabase  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("migrate_usajobs_password")


def main(commit: bool) -> None:
    # Small table; the default 1000-row page is plenty. Fetch id + value and filter
    # in Python so we don't depend on any specific query-builder null/not-null API.
    rows = (
        supabase.table("users")
        .select("id, usajobs_password")
        .execute()
        .data
        or []
    )

    scanned = skipped = encrypted = failed = 0
    for row in rows:
        value = row.get("usajobs_password")
        if not value or not str(value).strip():
            continue  # NULL / empty — nothing to encrypt
        scanned += 1
        uid = row["id"]
        if is_encrypted(value):
            skipped += 1
            continue
        try:
            ciphertext = encrypt_usajobs_password(value)
        except Exception:
            failed += 1
            logger.exception("Encrypt FAILED for user %s (value not logged)", uid)
            continue
        if commit:
            supabase.table("users").update(
                {"usajobs_password": ciphertext}
            ).eq("id", uid).execute()
        encrypted += 1
        logger.info("%s user %s", "Encrypted" if commit else "WOULD encrypt", uid)

    mode = "COMMIT" if commit else "DRY RUN"
    logger.info(
        "[%s] scanned=%d already-encrypted=%d encrypted=%d failed=%d",
        mode, scanned, skipped, encrypted, failed,
    )
    if failed:
        raise SystemExit(1)
    if not commit and encrypted:
        logger.info("Re-run with --commit to apply.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--commit", action="store_true", help="write changes (default: dry run)"
    )
    main(parser.parse_args().commit)
