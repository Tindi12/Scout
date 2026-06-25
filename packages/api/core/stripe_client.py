"""Single shared Stripe client + config (Epic 10.1).

Everything Stripe in 10.2-10.5 imports from here:
  - stripe_client     : the one StripeClient instance (never reassign stripe.api_key
                        or construct another client elsewhere)
  - price_id_for_tier : tier -> Stripe price ID mapping (paid tiers only)
  - STRIPE_WEBHOOK_SECRET : signing secret for the 10.3 webhook

STRIPE_SECRET_KEY is required and validated at import (fail fast, same as
core/supabase_client.py). The per-tier price IDs and the webhook secret are
resolved lazily / left optional so the API still boots before they're configured.
"""

import logging
import os

from dotenv import load_dotenv
from stripe import StripeClient

from core.subscription import PRO, SCOUT_PLUS

load_dotenv()

logger = logging.getLogger(__name__)

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
if not STRIPE_SECRET_KEY:
    raise RuntimeError("STRIPE_SECRET_KEY must be set")

# The one shared Stripe client. Import `stripe_client` from this module everywhere;
# use the v1 namespace for resources, e.g. stripe_client.v1.checkout.sessions.create(...).
stripe_client = StripeClient(STRIPE_SECRET_KEY)

# Webhook signing secret, consumed by the 10.3 webhook handler. Optional here so the
# app boots before webhooks are wired up; the webhook route enforces its presence.
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Paid tier -> env var holding that tier's Stripe recurring price ID. Free has no price.
_TIER_PRICE_ENV = {
    PRO: "STRIPE_PRICE_PRO",
    SCOUT_PLUS: "STRIPE_PRICE_SCOUT_PLUS",
}


def price_id_for_tier(tier: str) -> str:
    """Resolve the Stripe price ID for a paid tier from its env var.

    Resolved lazily (not at import) so the app boots before prices are configured.
    Raises ValueError for a non-paid / unknown tier, and RuntimeError if the tier's
    price env var is missing."""
    env_name = _TIER_PRICE_ENV.get(tier)
    if env_name is None:
        raise ValueError(f"No Stripe price is configured for tier {tier!r}")
    price_id = os.getenv(env_name)
    if not price_id:
        raise RuntimeError(f"{env_name} must be set to the Stripe price ID for {tier}")
    return price_id


def tier_for_price_id(price_id: str | None) -> str | None:
    """Reverse of price_id_for_tier: map a Stripe price ID back to its paid tier.

    Resolved lazily against the configured price env vars. Returns None when the
    price matches no known tier (e.g. an old/unrecognized price) — callers treat
    that as 'leave subscription_plan unchanged' rather than guessing."""
    if not price_id:
        return None
    for tier, env_name in _TIER_PRICE_ENV.items():
        if os.getenv(env_name) == price_id:
            return tier
    return None
