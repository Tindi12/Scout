"""Single source of truth for subscription-tier decisions.

Scout has exactly three tiers, stored in users.subscription_plan as lowercase
strings: 'free' | 'pro' | 'scout_plus'. Every access decision goes through the
helpers here — no inline `plan == 'pro'` / `is_pro` checks scattered around the
codebase. Use:

  - is_paid_user(plan)   for binary paid-vs-free gates (Pro AND Scout+ both paid)
  - get_tier_limits(plan) for anything that differs BY tier (e.g. application caps)

The is_pro boolean was removed in favour of this column; do not reintroduce it.
"""

from typing import TypedDict

# Canonical tier strings. These are the only valid values for subscription_plan.
FREE = "free"
PRO = "pro"
SCOUT_PLUS = "scout_plus"

VALID_PLANS = (FREE, PRO, SCOUT_PLUS)

_PAID_PLANS = (PRO, SCOUT_PLUS)

# Tier ordering for minimum-tier entitlement gates: free < pro < scout_plus.
_TIER_RANK = {FREE: 0, PRO: 1, SCOUT_PLUS: 2}


class TierLimits(TypedDict):
    application_limit: int
    copilot_unlimited: bool


# Per-tier limits in one place (pricing: free 10 lifetime, pro 40/30d,
# scout_plus 100/30d). application_limit is the canonical cap per tier; note the
# users table also stores applications_limit per-row, which is what runtime
# credit checks read — these constants are the source for what that column
# should be set to when a plan changes.
_TIER_LIMITS: dict[str, TierLimits] = {
    FREE: {"application_limit": 10, "copilot_unlimited": False},
    PRO: {"application_limit": 40, "copilot_unlimited": True},
    SCOUT_PLUS: {"application_limit": 100, "copilot_unlimited": True},
}


def normalize_plan(plan: str | None) -> str:
    """Coerce a raw subscription_plan value to a canonical tier string.

    Defends against legacy casing / synonyms; unknown values fall back to 'free'
    (the safe, least-privileged tier)."""
    value = (plan or "").strip().lower()
    if value in ("scout_plus", "scout+", "scoutplus"):
        return SCOUT_PLUS
    if value == PRO:
        return PRO
    return FREE


def is_paid_user(plan: str | None) -> bool:
    """True for any paid tier (pro or scout_plus). Use for binary paid-vs-free
    gates only — never to distinguish pro from scout_plus."""
    return normalize_plan(plan) in _PAID_PLANS


def get_tier_limits(plan: str | None) -> TierLimits:
    """Per-tier limits for the given plan. Use this for anything tier-specific so
    pro and scout_plus are never collapsed together."""
    return _TIER_LIMITS[normalize_plan(plan)]


def is_upgrade(from_plan: str | None, to_plan: str | None) -> bool:
    """True when `to_plan` is a STRICTLY higher tier than `from_plan` in the
    free < pro < scout_plus order.

    Use to distinguish a genuine upgrade (free→pro, pro→scout_plus) from a renewal
    (same tier) or a downgrade (scout_plus→pro) — e.g. so a congratulatory email
    fires only on real upgrades, not on every subscription.updated event."""
    return _TIER_RANK[normalize_plan(to_plan)] > _TIER_RANK[normalize_plan(from_plan)]


def meets_minimum_tier(plan: str | None, min_tier: str) -> bool:
    """True when `plan` is at least `min_tier` in the free < pro < scout_plus order.

    Use for entitlement gates: meets_minimum_tier(plan, 'pro') is any paid tier, and
    meets_minimum_tier(plan, 'scout_plus') is scout_plus only. Keeps tier ordering in
    one place so routes never compare plan strings inline."""
    return _TIER_RANK[normalize_plan(plan)] >= _TIER_RANK[normalize_plan(min_tier)]
