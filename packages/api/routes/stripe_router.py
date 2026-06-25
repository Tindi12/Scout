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

import stripe
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from stripe import StripeError

from core.auth import verify_resume_api_user
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


def _handle_checkout_completed(session) -> None:
    """checkout.session.completed — the user finished paying. Grant the purchased tier."""
    metadata = session.get("metadata") or {}
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    user_id = _resolve_user_id(metadata, customer_id)
    if not user_id:
        logger.warning(
            "checkout.session.completed: no matching user (customer=%s)", customer_id
        )
        return

    tier = (metadata.get("tier") or "").strip().lower()
    if tier not in _PAID_TIERS:
        # Metadata missing/invalid — recover the tier from the subscription's price.
        tier = _tier_from_subscription(subscription_id)
    if tier not in _PAID_TIERS:
        logger.error(
            "checkout.session.completed: could not determine tier for user %s "
            "(metadata=%s, subscription=%s)",
            user_id,
            metadata.get("tier"),
            subscription_id,
        )
        return

    _grant_tier(
        user_id,
        tier,
        customer_id=customer_id,
        subscription_id=subscription_id,
    )
    logger.info("Granted %s to user %s via checkout", tier, user_id)


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
    elif status in _REVOKE_STATUSES:
        _revert_to_free(user_id)
        logger.info("Reverted user %s to free (status=%s)", user_id, status)
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
        # loudly and still 200 so we can investigate without a retry storm.
        logger.error("Error handling Stripe event %s: %s", event_type, e, exc_info=True)
        return {"received": True, "handled": False}

    return {"received": True, "handled": True}
