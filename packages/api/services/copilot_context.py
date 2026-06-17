"""Build a compact, token-bounded CONTEXT block about the user for Scout Copilot.

Summarizes the user's profile, latest resume score, and application pipeline into a
short string the copilot system prompt can reference. Reads are synchronous (call via
run_in_threadpool). Returns "" when the user has no usable data — the caller then omits
the CONTEXT section entirely (the system prompt handles a missing block gracefully).
"""

import logging

from core.supabase_client import supabase

logger = logging.getLogger(__name__)

_RECENT_APPLICATIONS_CAP = 5

_DEGREE_LABELS = {
    "associate": "Associate's",
    "bachelors": "Bachelor's",
    "masters": "Master's",
    "phd": "PhD",
}

_WORK_AUTH_LABELS = {
    "us_citizen": "US citizen",
    "green_card": "Permanent resident (green card)",
    "f1_student": "F-1 student",
    "h1b": "H-1B",
    "other_visa": "Other visa",
    "not_authorized": "Not authorized to work in the US",
}


def _grad_label(education_end_date) -> str:
    """'2029-05-01' -> 'May 2029'; tolerant of bad/empty input."""
    v = str(education_end_date or "").strip()
    if len(v) >= 7 and v[4] == "-":
        months = (
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        )
        try:
            month_idx = int(v[5:7])
            if 1 <= month_idx <= 12:
                return f"{months[month_idx - 1]} {v[:4]}"
        except ValueError:
            pass
        return v[:4]
    return v


def _profile_lines(user_row: dict) -> list[str]:
    lines: list[str] = []
    name = (user_row.get("name") or "").strip()
    if name:
        lines.append(f"- Name: {name}")
    school = (user_row.get("school") or "").strip()
    degree = _DEGREE_LABELS.get((user_row.get("degree_type") or "").lower(), "")
    major = (user_row.get("major") or "").strip()
    study_bits = ", ".join(b for b in (degree, major) if b)
    if school and study_bits:
        lines.append(f"- Studying: {study_bits} at {school}")
    elif school:
        lines.append(f"- School: {school}")
    grad = _grad_label(user_row.get("education_end_date"))
    if grad:
        lines.append(f"- Expected graduation: {grad}")
    work_auth = _WORK_AUTH_LABELS.get((user_row.get("work_authorization") or "").lower())
    if work_auth:
        sponsor = " (needs visa sponsorship)" if user_row.get("requires_sponsorship") else ""
        lines.append(f"- Work authorization: {work_auth}{sponsor}")
    return lines


def _resume_lines(user_id: str) -> list[str]:
    try:
        resp = (
            supabase.table("analyses")
            .select("score, breakdown, target_role, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.warning("copilot context: analyses lookup failed: %s", e)
        return []
    rows = resp.data or []
    if not rows:
        return []
    row = rows[0]
    score = row.get("score")
    if score is None:
        return []
    role = (row.get("target_role") or "").strip()
    head = f"- Latest resume score: {score}/100" + (f" (target: {role})" if role else "")
    lines = [head]

    breakdown = row.get("breakdown")
    if isinstance(breakdown, dict) and breakdown:
        dims: list[str] = []
        for key, value in breakdown.items():
            num = value.get("score") if isinstance(value, dict) else value
            if isinstance(num, (int, float)):
                dims.append(f"{str(key).replace('_', ' ').title()} {num}")
            if len(dims) >= 4:
                break
        if dims:
            lines.append(f"  Dimensions: {', '.join(dims)}")
    return lines


def _application_lines(user_id: str) -> list[str]:
    try:
        resp = (
            supabase.table("applications")
            .select("company, role, status, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        logger.warning("copilot context: applications lookup failed: %s", e)
        return []
    rows = resp.data or []
    if not rows:
        return []

    counts: dict[str, int] = {}
    for r in rows:
        status = (r.get("status") or "unknown").strip() or "unknown"
        counts[status] = counts.get(status, 0) + 1
    count_str = ", ".join(f"{n} {s}" for s, n in sorted(counts.items()))
    lines = [f"- Applications ({len(rows)} total): {count_str}"]

    recent = rows[:_RECENT_APPLICATIONS_CAP]
    if recent:
        lines.append("- Most recent applications:")
        for r in recent:
            company = (r.get("company") or "?").strip() or "?"
            role = (r.get("role") or "?").strip() or "?"
            status = (r.get("status") or "?").strip() or "?"
            lines.append(f"  - {role} at {company} — {status}")
    return lines


def build_context_block(user_row: dict | None) -> str:
    """Assemble the compact CONTEXT string, or '' if there's nothing useful to add."""
    if not user_row:
        return ""
    user_id = user_row.get("id")
    sections = _profile_lines(user_row)
    if user_id:
        sections += _resume_lines(user_id)
        sections += _application_lines(user_id)
    return "\n".join(sections).strip()
