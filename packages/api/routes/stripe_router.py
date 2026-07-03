"""Stripe billing routes (Epic 10).

10.2 — hosted Checkout session creation. Creating a session is NOT payment: this
endpoint only starts the flow.
10.3 — the signature-verified webhook, which is the ONLY place subscription_plan is
moved to a paid tier or reverted to free.
10.4 — hosted billing-portal session for self-service subscription management.
"""

import json
import logging
import os

import sentry_sdk
import stripe
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from stripe import StripeError

from core.analytics import (
    EVENT_SUBSCRIPTION_ACTIVATED,
    capture,
    set_user_properties,
)
from core.auth import verify_resume_api_user
from core.email import (
    EMAIL_UPGRADE_PRO,
    EMAIL_UPGRADE_SCOUT_PLUS,
    claim_email_send,
    first_name_from,
    send_email,
)
from core.stripe_client import (
    STRIPE_WEBHOOK_SECRET,
    price_id_for_tier,
    stripe_client,
    tier_for_price_id,
)
from core.subscription import FREE, PRO, SCOUT_PLUS, is_paid_user
from core.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter()

# Frontend base URL for Checkout redirects (e.g. http://localhost:3000). Read once;
# the endpoint fails clearly if it's unset rather than crashing app startup.
FRONTEND_BASE_URL = (os.getenv("FRONTEND_BASE_URL") or "").rstrip("/")

# Only paid tiers can be purchased.
_PAID_TIERS = (PRO, SCOUT_PLUS)

# Subscription statuses that should revert a user to free. past_due / incomplete /
# paused are intentionally NOT here — those are grace/pending states where we keep
# access; the final revert comes from customer.subscription.deleted.
_REVOKE_STATUSES = {"canceled", "unpaid", "incomplete_expired"}
_GRANT_STATUSES = {"active", "trialing"}


class CheckoutRequest(BaseModel):
    tier: str


class ConfirmCheckoutRequest(BaseModel):
    session_id: str


def _fetch_user_billing(clerk_id: str) -> dict | None:
    """The minimal billing fields for the authenticated user."""
    result = (
        supabase.table("users")
        .select("id, email, stripe_customer_id, subscription_plan, stripe_subscription_id")
        .eq("clerk_id", clerk_id)
        .maybe_single()
        .execute()
    )
    return result.data


def _claim_customer_id(user_id: str, new_customer_id: str) -> str:
    """Persist a freshly created Stripe customer id, guarding against duplicates.

    Conditional UPDATE (only when still null) + re-read so two near-simultaneous
    checkouts can't both win: whoever's write lands first owns the customer. If we
    lost the race our just-created customer is an orphan — log it and use the stored
    one. (Read-then-write isn't fully atomic, but the conditional update closes the
    common window; a leftover orphan customer is harmless and rare.)"""
    supabase.table("users").update({"stripe_customer_id": new_customer_id}).eq(
        "id", user_id
    ).is_("stripe_customer_id", "null").execute()

    row = (
        supabase.table("users")
        .select("stripe_customer_id")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    stored = (row.data or {}).get("stripe_customer_id") or new_customer_id
    if stored != new_customer_id:
        logger.warning(
            "Discarding duplicate Stripe customer %s for user %s; keeping %s",
            new_customer_id,
            user_id,
            stored,
        )
    return stored


def _resolve_customer_id(user_row: dict) -> str:
    """Return this user's Stripe customer id, creating (and saving) one exactly once."""
    existing = user_row.get("stripe_customer_id")
    if existing:
        return existing

    customer = stripe_client.v1.customers.create(
        params={
            "email": user_row.get("email") or None,
            # Link the Stripe customer back to the Scout user for the 10.3 webhook.
            "metadata": {"scout_user_id": user_row["id"]},
        }
    )
    return _claim_customer_id(user_row["id"], customer.id)


@router.post("/create-checkout-session")
async def create_checkout_session(
    body: CheckoutRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict[str, str]:
    tier = body.tier.strip().lower()
    if tier not in _PAID_TIERS:
        raise HTTPException(
            status_code=400,
            detail="tier must be one of: pro, scout_plus",
        )

    if not FRONTEND_BASE_URL:
        logger.error("FRONTEND_BASE_URL is not set; cannot build Checkout redirect URLs")
        raise HTTPException(status_code=500, detail="Billing is not configured")

    try:
        price_id = price_id_for_tier(tier)
    except (ValueError, RuntimeError) as e:
        logger.error("No Stripe price configured for tier %s: %s", tier, e)
        raise HTTPException(status_code=500, detail="Billing is not configured")

    user_row = await run_in_threadpool(_fetch_user_billing, current_user["sub"])
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_row["id"]

    # Existing subscribers must MODIFY their subscription via the billing portal — never
    # create a second one through Checkout, which would double-charge them. This is the
    # server-side backstop in case the frontend ever routes a paid user here.
    if user_row.get("stripe_subscription_id") or is_paid_user(
        user_row.get("subscription_plan")
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "error": "already_subscribed",
                "action": "use_portal",
                "message": (
                    "You already have an active subscription. Switch plans from the "
                    "billing portal."
                ),
            },
        )

    # Scout user_id + tier travel on BOTH the session and the subscription so the 10.3
    # webhook can recover who paid and for which tier from whichever object it sees.
    upgrade_metadata = {"scout_user_id": user_id, "tier": tier}

    try:
        customer_id = await run_in_threadpool(_resolve_customer_id, user_row)
        session = await run_in_threadpool(
            lambda: stripe_client.v1.checkout.sessions.create(
                params={
                    "mode": "subscription",
                    "customer": customer_id,
                    "line_items": [{"price": price_id, "quantity": 1}],
                    "success_url": (
                        f"{FRONTEND_BASE_URL}/welcome?upgraded=1"
                        "&session_id={CHECKOUT_SESSION_ID}"
                    ),
                    "cancel_url": f"{FRONTEND_BASE_URL}/pricing",
                    "metadata": upgrade_metadata,
                    "subscription_data": {"metadata": upgrade_metadata},
                }
            )
        )
    except StripeError as e:
        # Log the full Stripe error server-side; return a clean, non-leaking message.
        logger.error("Stripe checkout session failed for user %s: %s", user_id, e)
        raise HTTPException(
            status_code=502,
            detail="Could not start checkout. Please try again.",
        )

    if not session.url:
        logger.error("Stripe returned a session without a url for user %s", user_id)
        raise HTTPException(status_code=502, detail="Could not start checkout. Please try again.")

    return {"url": session.url, "id": session.id}


@router.post("/confirm-checkout-session")
async def confirm_checkout_session(
    body: ConfirmCheckoutRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    """Fallback activation when the user lands on /welcome before the webhook fires.

    Retrieves the Checkout session from Stripe, verifies it belongs to the caller and
    is paid, then grants the tier using the same path as checkout.session.completed.
    Safe to call repeatedly — idempotent when the plan is already active."""
    session_id = body.session_id.strip()
    if not session_id.startswith("cs_"):
        raise HTTPException(status_code=400, detail="Invalid session_id")

    user_row = await run_in_threadpool(_fetch_user_billing, current_user["sub"])
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    current_plan = user_row.get("subscription_plan")
    if is_paid_user(current_plan):
        return {
            "subscription_plan": current_plan,
            "activated": False,
            "already_active": True,
        }

    try:
        session_obj = await run_in_threadpool(
            lambda: stripe_client.v1.checkout.sessions.retrieve(session_id)
        )
    except StripeError as e:
        logger.error(
            "Could not retrieve checkout session %s for user %s: %s",
            session_id,
            user_row["id"],
            e,
        )
        raise HTTPException(
            status_code=502,
            detail="Could not verify checkout. Please try again.",
        ) from e

    session = _as_dict(session_obj)

    if session.get("mode") != "subscription":
        raise HTTPException(status_code=400, detail="Invalid checkout session")

    if not _session_belongs_to_user(session, user_row):
        raise HTTPException(
            status_code=403,
            detail="Checkout session does not belong to this account",
        )

    if not _is_checkout_paid(session):
        raise HTTPException(status_code=409, detail="Checkout not complete yet")

    tier = await run_in_threadpool(
        _activate_from_completed_checkout,
        session,
        source="confirm-checkout-session",
    )
    if tier is None:
        raise HTTPException(
            status_code=502,
            detail="Could not activate plan from checkout session",
        )

    return {
        "subscription_plan": tier,
        "activated": True,
        "already_active": False,
    }


# ---------------------------------------------------------------------------
# 10.4 — Billing portal session (self-service subscription management)
# ---------------------------------------------------------------------------


def _is_portal_not_configured(err: StripeError) -> bool:
    """True when Stripe rejects the call because the customer portal hasn't been set up
    yet (a one-time dashboard step in test mode). Lets us return an actionable message
    instead of a generic failure."""
    msg = (getattr(err, "user_message", None) or str(err) or "").lower()
    return "configuration" in msg or "customer portal settings" in msg


@router.post("/create-portal-session")
async def create_portal_session(
    current_user: dict = Depends(verify_resume_api_user),
) -> dict[str, str]:
    """Hosted Stripe billing portal for the AUTHENTICATED user only. The customer id is
    derived from their own users row — never accepted from the client — so a user can
    only ever manage their own billing."""
    if not FRONTEND_BASE_URL:
        logger.error("FRONTEND_BASE_URL is not set; cannot build portal return URL")
        raise HTTPException(status_code=500, detail="Billing is not configured")

    user_row = await run_in_threadpool(_fetch_user_billing, current_user["sub"])
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    customer_id = user_row.get("stripe_customer_id")
    if not customer_id:
        # Never subscribed — there is nothing to manage.
        raise HTTPException(status_code=409, detail="No active billing account")

    try:
        session = await run_in_threadpool(
            lambda: stripe_client.v1.billing_portal.sessions.create(
                params={
                    "customer": customer_id,
                    "return_url": f"{FRONTEND_BASE_URL}/dashboard",
                }
            )
        )
    except StripeError as e:
        if _is_portal_not_configured(e):
            logger.error("Stripe billing portal is not configured: %s", e)
            raise HTTPException(
                status_code=503,
                detail=(
                    "Billing portal is not configured. Enable it in the Stripe "
                    "Dashboard: Settings -> Billing -> Customer portal -> Save."
                ),
            )
        logger.error("Stripe portal session failed for customer %s: %s", customer_id, e)
        raise HTTPException(
            status_code=502, detail="Could not open billing portal. Please try again."
        )

    if not session.url:
        logger.error(
            "Stripe returned a portal session without a url (customer %s)", customer_id
        )
        raise HTTPException(
            status_code=502, detail="Could not open billing portal. Please try again."
        )

    return {"url": session.url}


# ---------------------------------------------------------------------------
# 10.9 — In-app plan change (upgrade/downgrade between paid tiers)
# ---------------------------------------------------------------------------


class ChangePlanRequest(BaseModel):
    tier: str


@router.post("/change-plan")
async def change_plan(
    body: ChangePlanRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    """Switch an EXISTING subscriber between paid tiers by modifying their live
    subscription in place (price swap with proration) — never by creating a second
    subscription. Upgrades charge the prorated difference immediately against the
    card on file (proration_behavior=always_invoice + error_if_incomplete);
    downgrades leave a prorated credit on the customer balance. A pending
    cancel-at-period-end is cleared: changing plans means staying.

    The Stripe billing portal is NOT configured for plan switching (it only offers
    cancel), so this endpoint is the one plan-change mechanism. The
    customer.subscription.updated webhook remains the source of truth; the direct
    _grant_tier here is the same idempotent instant-UX fallback confirm-checkout
    uses. Users with no live subscription get a 409 telling the frontend to route
    through Checkout instead."""
    tier = body.tier.strip().lower()
    if tier not in _PAID_TIERS:
        raise HTTPException(
            status_code=400, detail="tier must be one of: pro, scout_plus"
        )

    try:
        new_price_id = price_id_for_tier(tier)
    except (ValueError, RuntimeError) as e:
        logger.error("No Stripe price configured for tier %s: %s", tier, e)
        raise HTTPException(status_code=500, detail="Billing is not configured")

    user_row = await run_in_threadpool(_fetch_user_billing, current_user["sub"])
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_row["id"]
    subscription_id = user_row.get("stripe_subscription_id")

    _use_checkout = HTTPException(
        status_code=409,
        detail={
            "error": "no_subscription",
            "action": "use_checkout",
            "message": "No active subscription to change — subscribe via checkout.",
        },
    )
    if not subscription_id:
        raise _use_checkout

    try:
        subscription = _as_dict(
            await run_in_threadpool(
                lambda: stripe_client.v1.subscriptions.retrieve(subscription_id)
            )
        )
    except StripeError as e:
        logger.error(
            "Could not retrieve subscription %s for user %s: %s",
            subscription_id, user_id, e,
        )
        raise HTTPException(
            status_code=502, detail="Could not load your subscription. Please try again."
        )

    # A dead subscription can't be modified — clear the stale id path via checkout.
    if subscription.get("status") not in _GRANT_STATUSES:
        raise _use_checkout

    items = (subscription.get("items") or {}).get("data") or []
    if not items:
        logger.error("Subscription %s has no items (user %s)", subscription_id, user_id)
        raise HTTPException(
            status_code=502, detail="Could not load your subscription. Please try again."
        )
    current_item = items[0]
    current_tier = tier_for_price_id((current_item.get("price") or {}).get("id"))

    if current_tier == tier and not subscription.get("cancel_at_period_end"):
        return {"subscription_plan": tier, "changed": False, "already_on_plan": True}

    try:
        await run_in_threadpool(
            lambda: stripe_client.v1.subscriptions.update(
                subscription_id,
                params={
                    "items": [{"id": current_item["id"], "price": new_price_id}],
                    # Upgrades: invoice + charge the prorated difference NOW, and
                    # fail loudly (rather than silently going past_due) if the card
                    # declines. Downgrades: the negative proration lands as a
                    # customer credit on the same immediate invoice.
                    "proration_behavior": "always_invoice",
                    "payment_behavior": "error_if_incomplete",
                    # Changing plans means staying — clear any pending cancellation.
                    "cancel_at_period_end": False,
                    "metadata": {"scout_user_id": user_id, "tier": tier},
                },
            )
        )
    except StripeError as e:
        logger.error(
            "Plan change to %s failed for user %s (subscription %s): %s",
            tier, user_id, subscription_id, e,
        )
        raise HTTPException(
            status_code=402,
            detail=(
                "Your card could not be charged for the plan change. Update your "
                "payment method in the billing portal and try again."
            ),
        )

    # Instant UX: reflect the new tier now. The subscription.updated webhook
    # re-applies the same values (idempotent) and owns analytics + thank-you email.
    await run_in_threadpool(
        _grant_tier, user_id, tier, subscription_id=subscription_id
    )
    logger.info(
        "Changed plan for user %s: %s -> %s (subscription %s)",
        user_id, current_tier or "unknown", tier, subscription_id,
    )
    return {"subscription_plan": tier, "changed": True, "already_on_plan": False}


# ---------------------------------------------------------------------------
# 10.3 — Webhook (source of truth for subscription_plan)
# ---------------------------------------------------------------------------


def _user_id_by_customer(customer_id: str | None) -> str | None:
    """Look up a Scout user by their Stripe customer id."""
    if not customer_id:
        return None
    row = (
        supabase.table("users")
        .select("id")
        .eq("stripe_customer_id", customer_id)
        .maybe_single()
        .execute()
    )
    return (row.data or {}).get("id") if row.data else None


def _clerk_id_for_user(user_id: str | None) -> str | None:
    """Map a Scout user id back to their Clerk id — the distinct_id PostHog uses so a
    server-side payment event ties to the same person the browser SDK identified."""
    if not user_id:
        return None
    row = (
        supabase.table("users")
        .select("clerk_id")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    return (row.data or {}).get("clerk_id") if row.data else None


def _resolve_user_id(metadata: dict | None, customer_id: str | None) -> str | None:
    """Resolve the Scout user for an event: prefer the user_id in metadata (set on the
    checkout session / subscription in 10.2), else fall back to stripe_customer_id."""
    uid = (metadata or {}).get("scout_user_id")
    if uid:
        return uid
    return _user_id_by_customer(customer_id)


def _apply_user_update(user_id: str, fields: dict) -> None:
    """Idempotent UPDATE of billing fields keyed by user id. Re-applying the same
    values is a harmless no-op, which is what makes duplicate deliveries safe.

    Logs loudly if the update matches no row (e.g. an id that isn't a real users.id) so
    a mapping bug can never fail silently."""
    res = supabase.table("users").update(fields).eq("id", user_id).execute()
    if not (res.data or []):
        logger.error(
            "Webhook update matched no users row for id=%s (fields=%s)",
            user_id,
            list(fields),
        )


def _grant_tier(
    user_id: str,
    tier: str,
    *,
    customer_id: str | None = None,
    subscription_id: str | None = None,
) -> None:
    """Set the user's specific paid tier (pro vs scout_plus — never flattened) and
    backfill the Stripe ids when present."""
    fields: dict = {"subscription_plan": tier}
    if customer_id:
        fields["stripe_customer_id"] = customer_id
    if subscription_id:
        fields["stripe_subscription_id"] = subscription_id
    _apply_user_update(user_id, fields)


_UPGRADE_EMAIL_TYPES = {
    PRO: EMAIL_UPGRADE_PRO,
    SCOUT_PLUS: EMAIL_UPGRADE_SCOUT_PLUS,
}


def _send_upgrade_thanks(user_id: str, tier: str) -> None:
    """Founder thank-you for a paid activation. Webhook-truth only: called right
    after _grant_tier, never from the frontend redirect. Once per (user, tier) for
    life — renewals re-hit the claim and no-op; a Pro→Scout+ switch is a new tier
    and gets its own thanks; portal flapping can never re-email. Failures are
    swallowed by core/email.py: granting paid access NEVER depends on this."""
    try:
        email_type = _UPGRADE_EMAIL_TYPES.get(tier)
        if not email_type:
            return
        if not claim_email_send(user_id, email_type):
            return
        row = (
            supabase.table("users")
            .select("email, name")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        data = (row.data if row else None) or {}
        send_email(
            to=data.get("email"),
            email_type=email_type,
            first_name=first_name_from(data.get("name")),
            user_id=user_id,
        )
    except Exception as e:  # noqa: BLE001 — thanks mail must never touch the grant path
        logger.error("Upgrade thank-you failed for user %s: %s", user_id, e)


def _revert_to_free(user_id: str) -> None:
    """Revert to free and clear the (now-dead) subscription id. The stripe_customer_id
    is kept on purpose so a resubscribe reuses the same customer."""
    _apply_user_update(
        user_id, {"subscription_plan": FREE, "stripe_subscription_id": None}
    )


def _tier_from_subscription(subscription_id: str | None) -> str | None:
    """Fallback when checkout metadata lacks a valid tier: fetch the subscription and
    map its current price id back to a tier. One extra Stripe call, only on that edge."""
    if not subscription_id:
        return None
    try:
        sub = stripe_client.v1.subscriptions.retrieve(subscription_id)
    except StripeError as e:
        logger.error("Could not retrieve subscription %s: %s", subscription_id, e)
        return None
    return tier_for_price_id(_subscription_price_id(sub))


def _subscription_price_id(subscription) -> str | None:
    """Pull the price id off a subscription object (first line item)."""
    try:
        items = subscription["items"]["data"]
        return items[0]["price"]["id"] if items else None
    except (KeyError, IndexError, TypeError):
        return None


def _as_dict(obj) -> dict:
    """Normalize a Stripe SDK object (or webhook dict) to a plain dict for handlers."""
    if isinstance(obj, dict):
        return obj
    to_dict = getattr(obj, "to_dict", None)
    if callable(to_dict):
        return to_dict()
    return dict(obj)


def _tier_from_checkout_session(session: dict) -> str | None:
    metadata = session.get("metadata") or {}
    tier = (metadata.get("tier") or "").strip().lower()
    if tier in _PAID_TIERS:
        return tier
    return _tier_from_subscription(session.get("subscription"))


def _is_checkout_paid(session: dict) -> bool:
    """True when Stripe considers the Checkout session successfully paid."""
    if session.get("payment_status") == "paid":
        return True
    return session.get("status") == "complete"


def _session_belongs_to_user(session: dict, user_row: dict) -> bool:
    """Ensure the authenticated user owns this Checkout session."""
    metadata = session.get("metadata") or {}
    if metadata.get("scout_user_id") == user_row["id"]:
        return True
    customer_id = session.get("customer")
    stored_customer = user_row.get("stripe_customer_id")
    return bool(customer_id and stored_customer and customer_id == stored_customer)


def _user_was_paid_before_grant(user_id: str) -> bool:
    row = (
        supabase.table("users")
        .select("subscription_plan")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    return is_paid_user((row.data or {}).get("subscription_plan"))


def _activate_from_completed_checkout(session: dict, *, source: str) -> str | None:
    """Grant a paid tier from a completed Checkout session.

    Shared by the webhook and the /welcome fallback (confirm-checkout-session).
    Side effects (analytics, thank-you email) run only on the first free→paid
    transition so duplicate webhook + confirm calls stay idempotent."""
    metadata = session.get("metadata") or {}
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    user_id = _resolve_user_id(metadata, customer_id)
    if not user_id:
        logger.warning(
            "%s: no matching user for checkout session (customer=%s)",
            source,
            customer_id,
        )
        return None

    tier = _tier_from_checkout_session(session)
    if tier not in _PAID_TIERS:
        logger.error(
            "%s: could not determine tier for user %s (metadata=%s, subscription=%s)",
            source,
            user_id,
            metadata.get("tier"),
            subscription_id,
        )
        return None

    was_paid = _user_was_paid_before_grant(user_id)

    _grant_tier(
        user_id,
        tier,
        customer_id=customer_id,
        subscription_id=subscription_id,
    )
    logger.info("Granted %s to user %s via %s", tier, user_id, source)

    if not was_paid:
        clerk_id = _clerk_id_for_user(user_id)
        if clerk_id:
            capture(
                clerk_id,
                EVENT_SUBSCRIPTION_ACTIVATED,
                {"tier": tier},
                flush=True,
            )
            set_user_properties(clerk_id, {"subscription_plan": tier})
        _send_upgrade_thanks(user_id, tier)

    return tier


def _handle_checkout_completed(session) -> None:
    """checkout.session.completed — the user finished paying. Grant the purchased tier."""
    _activate_from_completed_checkout(session, source="checkout.session.completed webhook")


def _handle_subscription_updated(subscription) -> None:
    """customer.subscription.updated — plan change / renewal / status change."""
    status = subscription.get("status")
    customer_id = subscription.get("customer")
    metadata = subscription.get("metadata") or {}
    subscription_id = subscription.get("id")

    user_id = _resolve_user_id(metadata, customer_id)
    if not user_id:
        logger.warning(
            "customer.subscription.updated: no matching user (customer=%s)", customer_id
        )
        return

    if status in _GRANT_STATUSES:
        tier = tier_for_price_id(_subscription_price_id(subscription))
        if tier is None:
            logger.error(
                "subscription.updated active but price maps to no tier for user %s",
                user_id,
            )
            return
        _grant_tier(user_id, tier, subscription_id=subscription_id)
        logger.info("Set user %s to %s (status=%s)", user_id, tier, status)
        # Keep the PostHog person's tier accurate on upgrades/downgrades (portal plan
        # changes flow through here, not checkout). Not counted as an activation —
        # subscription.updated also fires on every renewal, which would inflate it.
        set_user_properties(_clerk_id_for_user(user_id), {"subscription_plan": tier})
        # Thank-you rides the same webhook truth. The per-(user, tier) claim inside
        # makes renewals a no-op and gives portal switches (Pro→Scout+) one thanks.
        _send_upgrade_thanks(user_id, tier)
    elif status in _REVOKE_STATUSES:
        _revert_to_free(user_id)
        logger.info("Reverted user %s to free (status=%s)", user_id, status)
        set_user_properties(_clerk_id_for_user(user_id), {"subscription_plan": FREE})
    else:
        # past_due / incomplete / paused — keep access during the grace window.
        logger.info("Ignoring subscription.updated for user %s (status=%s)", user_id, status)


def _handle_subscription_deleted(subscription) -> None:
    """customer.subscription.deleted — subscription fully ended. Revert to free."""
    customer_id = subscription.get("customer")
    metadata = subscription.get("metadata") or {}

    user_id = _resolve_user_id(metadata, customer_id)
    if not user_id:
        logger.warning(
            "customer.subscription.deleted: no matching user (customer=%s)", customer_id
        )
        return
    _revert_to_free(user_id)
    logger.info("Reverted user %s to free (subscription deleted)", user_id)
    set_user_properties(_clerk_id_for_user(user_id), {"subscription_plan": FREE})


_EVENT_HANDLERS = {
    "checkout.session.completed": _handle_checkout_completed,
    "customer.subscription.updated": _handle_subscription_updated,
    "customer.subscription.deleted": _handle_subscription_deleted,
}


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    """Stripe-called, signature-verified. The ONLY place subscription_plan changes for
    payment reasons. Unauthenticated (no Clerk) but every event is verified against the
    raw body + signing secret. Returns 400 only on verification failure; 200 otherwise
    (including ignored/unmatched events) so Stripe doesn't retry forever."""
    payload = await request.body()  # RAW bytes — must not be re-serialized before verify
    sig_header = request.headers.get("stripe-signature")

    if not STRIPE_WEBHOOK_SECRET:
        logger.error("STRIPE_WEBHOOK_SECRET is not set; cannot verify webhook")
        raise HTTPException(status_code=400, detail="Webhook not configured")

    try:
        stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError):
        # Bad payload or forged/invalid signature — reject outright.
        raise HTTPException(status_code=400, detail="Invalid signature")

    # construct_event returns Stripe's StripeObject, which (in this SDK version) does NOT
    # support dict-style .get(). The handlers are written against plain dicts, so dispatch
    # on the parsed raw payload — the very bytes we just verified by signature.
    event = json.loads(payload)
    event_type = event["type"]
    handler = _EVENT_HANDLERS.get(event_type)
    if handler is None:
        # Validly signed but not an event we act on — acknowledge and move on.
        return {"received": True, "handled": False}

    obj = event["data"]["object"]
    try:
        await run_in_threadpool(handler, obj)
    except Exception as e:
        # Event was authentic; a handler hiccup shouldn't trigger Stripe retries. Log
        # loudly and still 200 so we can investigate without a retry storm. We swallow
        # the exception (return 200) by design, so Sentry won't see it automatically —
        # capture it explicitly so a silently-failing webhook is still visible. The
        # raw event object is NOT attached (it carries customer PII); only the type.
        sentry_sdk.set_tag("stripe_event_type", event_type)
        sentry_sdk.capture_exception(e)
        logger.error("Error handling Stripe event %s: %s", event_type, e, exc_info=True)
        return {"received": True, "handled": False}

    return {"received": True, "handled": True}
