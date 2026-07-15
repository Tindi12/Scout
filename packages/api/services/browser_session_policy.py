"""Portal-aware Browserbase session policy for Scout apply runs.

Ashby's own false-positive guidance names proxy/VPN use and ad blockers as
triggers for "possible spam". Scout keeps block_ads on for heavy ATS pages
(timeout defense) but defaults it OFF for Ashby. Toggle with SCOUT_ASHBY_BLOCK_ADS.
"""
from __future__ import annotations

import os

from services.portal_detector import detect_portal


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def resolve_block_ads(*, portal: str | None = None, job_url: str = "") -> bool:
    """
    Return whether Browserbase should enable ad blocking for this apply.

    Defaults:
    - Ashby: False (SCOUT_ASHBY_BLOCK_ADS overrides; unset => off)
    - All other portals: True
    """
    resolved = detect_portal(job_url or "", portal or "unknown")
    if resolved == "ashby":
        # Default off for Ashby; explicit true/false via env still wins.
        return _env_bool("SCOUT_ASHBY_BLOCK_ADS", False)
    return True


def resolve_portal(*, portal: str | None = None, job_url: str = "") -> str:
    """Normalize a portal label from an explicit value or the job URL."""
    return detect_portal(job_url or "", portal or "unknown")
