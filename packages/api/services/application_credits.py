"""Application-credit accounting for failed Scout applications.

Policy: a credit is charged when an application is queued, and refunded the
moment it transitions to a terminal failure (including user cancellation).
Retrying charges a fresh credit, so a failure is always net-zero for the user.

Refunds are tied to the failed-status TRANSITION, not the failed state: the
update filters out rows already marked failed, and only rows actually flipped
are refunded. That keeps the refund idempotent when several paths race to fail
the same application (worker vs. stop-all).
"""

import logging

from core.supabase_client import supabase

logger = logging.getLogger(__name__)

# Optimistic-concurrency retries for the users.applications_used decrement.
# Contention is per-user and failures are rare, so collisions are unlikely;
# a handful of attempts is plenty.
_REFUND_CAS_ATTEMPTS = 4


def refund_application_credits(user_id: str, count: int = 1) -> bool:
    """Give back `count` application credits (floored at zero used).

    Compare-and-swap on the current applications_used value so concurrent
    refunds for the same user never clobber each other. Returns True when the
    decrement was applied. A refund that cannot be applied is logged loudly but
    never raised — credit accounting must not break the failure path itself.
    """
    if count <= 0:
        return True
    for _ in range(_REFUND_CAS_ATTEMPTS):
        try:
            row = (
                supabase.table("users")
                .select("applications_used")
                .eq("id", user_id)
                .single()
                .execute()
            )
            if not row.data:
                logger.error("credit refund skipped — user %s not found", user_id)
                return False
            used = row.data.get("applications_used") or 0
            new_used = max(0, used - count)
            if new_used == used:
                return True
            resp = (
                supabase.table("users")
                .update({"applications_used": new_used})
                .eq("id", user_id)
                .eq("applications_used", used)
                .execute()
            )
            if resp.data:
                logger.info(
                    "refunded %s application credit(s) to user %s (%s -> %s)",
                    count, user_id, used, new_used,
                )
                return True
            # CAS lost — another writer moved applications_used; re-read and retry.
        except Exception:
            logger.exception("credit refund attempt failed for user %s", user_id)
    logger.error(
        "credit refund NOT applied for user %s after %s attempts",
        user_id, _REFUND_CAS_ATTEMPTS,
    )
    return False


def fail_application_with_refund(
    *,
    application_id: str,
    user_id: str,
    error_message: str,
) -> bool:
    """Mark one application failed and refund its credit, exactly once.

    Returns True when this call performed the failed transition (and therefore
    the refund); False when the row was already failed or missing.
    """
    resp = (
        supabase.table("applications")
        .update({"status": "failed", "error_message": error_message})
        .eq("id", application_id)
        .eq("user_id", user_id)
        .neq("status", "failed")
        .execute()
    )
    transitioned = bool(resp.data)
    if transitioned:
        refund_application_credits(user_id)
    return transitioned
