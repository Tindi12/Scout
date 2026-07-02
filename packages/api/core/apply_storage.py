"""
Short-lived, signed delivery of the per-application resume / cover-letter PDFs to the
Browserbase Agent.

The hosted agent can't be handed local bytes — it fetches files from a URL and
downloads them into its sandbox. So each apply uploads the freshly generated PDF to a
PRIVATE Supabase Storage bucket and mints a short-TTL **signed** URL (never a public
bucket path — resume PII must never sit at a public/guessable location). The URL
expires on its own; we also best-effort delete the object when the run finishes.

All access here is server-side, service-role, from the Celery worker. The browser never
touches this bucket directly (only the agent, via the signed URL), so no storage RLS
policy is required — private + service-role writes + signed reads is the whole model.
"""
from __future__ import annotations

import logging
import os

from dotenv import load_dotenv

from core.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")

# Private bucket holding transient apply artifacts. Objects are deleted after each run;
# the signed-URL TTL is the backstop if cleanup is skipped (e.g. worker death).
BUCKET = os.getenv("APPLY_ARTIFACTS_BUCKET", "apply-artifacts")

# Signed-URL lifetime. Sized to the Browserbase run budget rather than the prompt's
# original ~10 min: a run can sit PENDING before the agent downloads the file, so the
# URL must outlive queue wait + download. 1200s (20 min) matches the old Browserbase
# session ceiling and stays short and unguessable.
SIGNED_URL_TTL_SECONDS = int(os.getenv("APPLY_ARTIFACTS_URL_TTL", "1200"))

_bucket_ready = False


def _ensure_bucket() -> None:
    """Create the private bucket once per process if it doesn't exist (idempotent).

    Defensive across storage3 versions: check first, then try both create signatures,
    and treat an already-exists race as success so a live pod never fails an apply on
    bucket setup."""
    global _bucket_ready
    if _bucket_ready:
        return
    try:
        supabase.storage.get_bucket(BUCKET)
        _bucket_ready = True
        return
    except Exception:
        pass  # not found (or version quirk) — try to create it
    try:
        try:
            supabase.storage.create_bucket(BUCKET, options={"public": False})
        except TypeError:
            # Older storage3 positional signature.
            supabase.storage.create_bucket(BUCKET)
    except Exception as exc:
        # Most likely a concurrent create / already-exists. Log and proceed; the upload
        # below will surface a real, persistent problem.
        logger.warning("apply-artifacts bucket ensure: %s", exc)
    _bucket_ready = True


def _resolve_signed_url(res: dict, path: str) -> str:
    """Pull the signed URL out of storage3's response (key name varies by version) and
    absolutize it if the SDK returned a relative /storage/v1/... path."""
    url = None
    if isinstance(res, dict):
        url = res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    if not url:
        raise RuntimeError(f"Could not mint a signed URL for {path}: {res!r}")
    if url.startswith("/"):
        url = f"{SUPABASE_URL}{url}"
    return url


def upload_and_sign(pdf_bytes: bytes, object_path: str) -> str:
    """
    Upload `pdf_bytes` to BUCKET at `object_path` (upsert) and return a short-TTL signed
    URL the agent can download. Raises on failure — the caller decides whether a missing
    file is fatal (resume) or skippable (cover letter).
    """
    _ensure_bucket()
    store = supabase.storage.from_(BUCKET)
    # storage3 wants string-valued file options; upsert lets a retry overwrite.
    store.upload(
        object_path,
        pdf_bytes,
        {"content-type": "application/pdf", "upsert": "true"},
    )
    res = store.create_signed_url(object_path, SIGNED_URL_TTL_SECONDS)
    return _resolve_signed_url(res, object_path)


def delete_objects(object_paths: list[str]) -> None:
    """Best-effort removal of apply artifacts. Never raises — the TTL is the backstop."""
    paths = [p for p in object_paths if p]
    if not paths:
        return
    try:
        supabase.storage.from_(BUCKET).remove(paths)
    except Exception:
        logger.debug("apply-artifacts cleanup failed for %s", paths, exc_info=True)
