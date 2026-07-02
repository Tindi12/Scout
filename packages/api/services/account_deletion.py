"""
Account-deletion orchestrator — the single place a user's data is erased everywhere.

Order is the whole design: external systems are cleaned up BEFORE the local users row
is deleted, because that row holds the ids the cleanup needs (Stripe customer /
subscription, Composio connected account, the storage prefixes). Clerk deletion is
deliberately NOT here — CLERK_SECRET_KEY lives only in the Next.js environment, so the
web proxy route deletes the Clerk user LAST, after this orchestrator reports success.
That also preserves the authenticated session for retries if anything here fails.

Contract:
- Idempotent: re-running for a partially (or fully) deleted user completes cleanly;
  "record already gone" is a skip, never a failure.
- No silent partial failures: billing/storage failures ABORT before the users row is
  deleted (the ids survive for a retry) and AccountDeletionError carries the per-step
  report of exactly what completed. Composio mail disconnect is best-effort (same as
  DELETE /user/mail-connection): a remote 500 must not block deletion — dropping the
  users row removes our only reference to the connection id.
- Logs and Sentry events carry ids and step names only — never resume content, the
  usajobs_password (plaintext or ciphertext), or OAuth tokens.
"""
from __future__ import annotations

import logging

import sentry_sdk
from stripe import InvalidRequestError, StripeError

from core import composio_mail, newsletter
from core.apply_storage import BUCKET as APPLY_ARTIFACTS_BUCKET
from core.email import EMAIL_FAREWELL, first_name_from, send_email
from core.stripe_client import stripe_client
from core.supabase_client import supabase

logger = logging.getLogger(__name__)

# Bucket holding user-uploaded resume files, keyed by Clerk id prefix
# (see packages/web/app/actions/resume.ts).
RESUMES_BUCKET = "resumes"

# Step outcomes in the report returned to the caller.
DELETED = "deleted"
SKIPPED = "skipped"  # nothing to do — record already gone / never existed
FAILED = "failed"

STEPS = (
    "stripe_subscription",
    "stripe_customer",
    "composio_mail",
    "newsletter_contact",
    "storage_resumes",
    "storage_apply_artifacts",
    "database",
)


class AccountDeletionError(Exception):
    """A real (non-already-gone) failure before the DB row was deleted. `steps` says
    exactly which steps completed; retrying is safe because the users row survives."""

    def __init__(self, steps: dict[str, str]):
        failed = [name for name, state in steps.items() if state == FAILED]
        super().__init__(f"Account deletion incomplete (failed: {', '.join(failed)})")
        self.steps = steps


def _fetch_deletion_row(clerk_id: str) -> dict | None:
    # email/name are grabbed here — before anything is deleted — so the farewell can
    # still reach an address that is about to stop existing locally.
    res = (
        supabase.table("users")
        .select(
            "id, email, name, stripe_customer_id, stripe_subscription_id,"
            " composio_account_id"
        )
        .eq("clerk_id", clerk_id)
        .maybe_single()
        .execute()
    )
    return res.data if res else None


def _stripe_already_gone(exc: StripeError) -> bool:
    """True when Stripe says there is nothing left to cancel/delete — the retry-safe
    'already done' cases: missing resource, or a subscription already canceled."""
    code = getattr(exc, "code", None)
    if code == "resource_missing":
        return True
    msg = (getattr(exc, "user_message", None) or str(exc) or "").lower()
    return "no such" in msg or "canceled subscription" in msg


def _cancel_stripe_subscription(subscription_id: str | None) -> str:
    if not subscription_id:
        return SKIPPED
    try:
        stripe_client.v1.subscriptions.cancel(subscription_id)
        return DELETED
    except StripeError as exc:
        if _stripe_already_gone(exc):
            return SKIPPED
        raise


def _delete_stripe_customer(customer_id: str | None) -> str:
    if not customer_id:
        return SKIPPED
    try:
        stripe_client.v1.customers.delete(customer_id)
        return DELETED
    except StripeError as exc:
        if _stripe_already_gone(exc):
            return SKIPPED
        raise


def _disconnect_composio(account_id: str | None) -> str:
    if not account_id:
        return SKIPPED
    if not composio_mail.is_configured():
        # Feature off on this deployment — there is no live token to revoke here.
        return SKIPPED
    try:
        composio_mail.disconnect(account_id)
        return DELETED
    except Exception as exc:  # noqa: BLE001 — SDK raises provider-specific types
        if "404" in str(exc) or "not found" in str(exc).lower():
            return SKIPPED
        # Composio occasionally 500s on delete (ConnectedAccount_InternalServerError).
        # Blocking account deletion would strand the user with no self-serve exit; the
        # users row is the only local linkage and is removed in the database step.
        logger.warning(
            "Composio disconnect failed for %s… (proceeding with account deletion): %s",
            (account_id or "")[:12],
            exc,
        )
        sentry_sdk.capture_exception(exc)
        return SKIPPED


def _remove_newsletter_contact(email: str | None) -> str:
    if not email:
        return SKIPPED
    if not newsletter.has_api_key():
        # Feature off on this deployment — there is no contact to remove.
        return SKIPPED
    try:
        newsletter.remove_contact(email)
        return DELETED
    except Exception as exc:  # noqa: BLE001 — SDK raises provider-specific types
        if "404" in str(exc) or "not found" in str(exc).lower():
            return SKIPPED
        raise


def _list_object_paths(bucket: str, prefix: str, depth: int = 0) -> list[str]:
    """Recursive object listing under `prefix` (storage list() is per-folder; folders
    come back with a null id). Depth-capped well past the deepest real layout
    ({user}/{application}/{file})."""
    if depth > 4:
        return []
    entries = supabase.storage.from_(bucket).list(prefix, {"limit": 1000}) or []
    paths: list[str] = []
    for entry in entries:
        name = entry.get("name")
        if not name:
            continue
        full = f"{prefix}/{name}" if prefix else name
        if entry.get("id"):
            paths.append(full)
        else:
            paths.extend(_list_object_paths(bucket, full, depth + 1))
    return paths


def _purge_bucket_prefix(bucket: str, prefix: str) -> str:
    if not prefix:
        return SKIPPED
    try:
        paths = _list_object_paths(bucket, prefix)
        if not paths:
            return SKIPPED
        supabase.storage.from_(bucket).remove(paths)
        return DELETED
    except Exception as exc:  # noqa: BLE001 — storage3 raises version-specific types
        if "not found" in str(exc).lower():
            return SKIPPED  # bucket doesn't exist on this deployment
        raise


def _delete_users_row(clerk_id: str) -> str:
    rows = (
        supabase.table("users").delete().eq("clerk_id", clerk_id).execute().data or []
    )
    return DELETED if rows else SKIPPED


def delete_account_data(clerk_id: str) -> dict:
    """Erase everything Scout holds for `clerk_id`: Stripe → Composio → Storage → DB
    (children removed by ON DELETE CASCADE, including the encrypted usajobs_password
    on the row itself). Returns {"ok", "already_deleted", "steps"}; raises
    AccountDeletionError before touching the DB row if any external step truly fails.
    """
    steps: dict[str, str] = {name: SKIPPED for name in STEPS}

    row = _fetch_deletion_row(clerk_id)
    if row is None:
        # Nothing local — a completed (or retried) deletion. Idempotent success.
        logger.info("Account deletion: no users row for %s (already deleted)", clerk_id)
        return {"ok": True, "already_deleted": True, "steps": steps}

    def _run(step: str, fn, *args) -> bool:
        try:
            steps[step] = fn(*args)
            return True
        except Exception as exc:  # noqa: BLE001
            steps[step] = FAILED
            logger.error(
                "Account deletion step %s failed for %s: %s", step, clerk_id, exc
            )
            sentry_sdk.set_tag("account_deletion_step", step)
            sentry_sdk.capture_exception(exc)
            return False

    ok = _run("stripe_subscription", _cancel_stripe_subscription, row.get("stripe_subscription_id"))
    ok &= _run("stripe_customer", _delete_stripe_customer, row.get("stripe_customer_id"))
    ok &= _run("composio_mail", _disconnect_composio, row.get("composio_account_id"))
    ok &= _run("newsletter_contact", _remove_newsletter_contact, row.get("email"))
    ok &= _run("storage_resumes", _purge_bucket_prefix, RESUMES_BUCKET, clerk_id)
    ok &= _run(
        "storage_apply_artifacts", _purge_bucket_prefix, APPLY_ARTIFACTS_BUCKET, row.get("id")
    )

    if not ok:
        # Abort BEFORE the users row goes — it holds the ids a retry needs, and an
        # active subscription must never outlive its user silently.
        raise AccountDeletionError(steps)

    # Farewell email — HERE and only here: external cleanup has succeeded (deletion
    # is now certain) and the row still exists, so the address does too. Placement
    # makes it at-most-once: an aborted run never reaches it; a retry after the row
    # is gone exits at the top. send_email never raises, but deletion is the one flow
    # that must be unstoppable, so belt-and-braces anyway.
    try:
        send_email(
            to=row.get("email"),
            email_type=EMAIL_FAREWELL,
            first_name=first_name_from(row.get("name")),
            user_id=row.get("id"),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Farewell email failed for %s (deletion proceeds): %s", clerk_id, exc)

    if not _run("database", _delete_users_row, clerk_id):
        raise AccountDeletionError(steps)

    logger.info("Account deletion completed for %s: %s", clerk_id, steps)
    return {"ok": True, "already_deleted": False, "steps": steps}
