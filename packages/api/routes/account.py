"""
Self-serve account deletion (Settings → Account → Delete account).

One authenticated endpoint. The user is derived from the session — a user_id is never
accepted from the request, so a user can only ever delete their OWN account. The
orchestration itself (Stripe → Storage → DB, in that order, idempotent,
step-logged) lives in services/account_deletion.py; the Next.js proxy route deletes
the Clerk user LAST after this returns success.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from core.auth import verify_resume_api_user
from services.account_deletion import AccountDeletionError, delete_account_data

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/delete")
async def delete_account(user: dict = Depends(verify_resume_api_user)) -> dict:
    """Erase everything Scout holds for the authenticated user. Safe to retry: a
    partially deleted account completes cleanly, an already-deleted one no-ops."""
    try:
        return await run_in_threadpool(delete_account_data, user["sub"])
    except AccountDeletionError as exc:
        # External cleanup failed BEFORE the local row was touched — the client can
        # retry. The step report says exactly what completed (no ids, no PII).
        raise HTTPException(
            status_code=502,
            detail={"error": "account_deletion_incomplete", "steps": exc.steps},
        ) from exc
