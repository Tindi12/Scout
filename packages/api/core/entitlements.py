"""Server-side paid-tier enforcement (Epic 10.5).

Reusable FastAPI dependencies that gate endpoints by subscription tier. The UI hiding
a feature is not enough — the API must reject unentitled access directly.

Usage:
    from core.entitlements import require_paid, require_scout_plus

    @router.post("/rewrite")
    async def rewrite(current_user: dict = Depends(require_paid)):
        ...

`require_tier(min_tier)` is the factory; `require_paid` (any paid tier) and
`require_scout_plus` (scout_plus only) are the ready-made dependencies. All tier
logic routes through the Epic 9 helpers in core.subscription — no inline plan checks.
A blocked user gets a 403 (authenticated but not entitled) with a structured
`upgrade_required` payload the frontend can render as an upgrade CTA.
"""

import logging
from typing import Callable

from fastapi import Depends, HTTPException, status
from starlette.concurrency import run_in_threadpool

from core.auth import verify_resume_api_user
from core.subscription import PRO, SCOUT_PLUS, meets_minimum_tier, normalize_plan
from core.supabase_client import supabase

logger = logging.getLogger(__name__)

# Human-readable label per required tier for the 403 message.
_TIER_LABEL = {PRO: "Pro", SCOUT_PLUS: "Scout+"}


def _fetch_plan(clerk_id: str) -> str | None:
    """The authenticated user's subscription_plan (None if no user row)."""
    result = (
        supabase.table("users")
        .select("subscription_plan")
        .eq("clerk_id", clerk_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        return None
    return result.data.get("subscription_plan")


def require_tier(min_tier: str) -> Callable:
    """Build a dependency that requires at least `min_tier` (free < pro < scout_plus).

    require_tier('pro') gates to any paid tier; require_tier('scout_plus') gates to
    scout_plus only. Returns the authenticated user dict on success; raises 403 with a
    structured upgrade_required payload otherwise."""
    label = _TIER_LABEL.get(normalize_plan(min_tier), "a paid plan")

    async def dependency(
        current_user: dict = Depends(verify_resume_api_user),
    ) -> dict:
        plan = await run_in_threadpool(_fetch_plan, current_user["sub"])
        if plan is None:
            # Authenticated token but no Scout user row — treat as unentitled, not 500.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if not meets_minimum_tier(plan, min_tier):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "upgrade_required",
                    "required_tier": normalize_plan(min_tier),
                    "current_tier": normalize_plan(plan),
                    "message": f"This feature requires {label}. Upgrade to unlock it.",
                },
            )
        return current_user

    return dependency


# Any paid tier (pro OR scout_plus) — the common gate for Pro features.
require_paid = require_tier(PRO)

# Scout+ only — for higher-tier features, if any.
require_scout_plus = require_tier(SCOUT_PLUS)
