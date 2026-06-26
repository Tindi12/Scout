"""In-app notifications (Epic 8). Persisted in public.notifications."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from core.supabase_client import supabase

logger = logging.getLogger(__name__)

NOTIFICATION_TYPES = frozenset({
    "application_failed",
    "application_needs_attention",
    "application_awaiting_code",
    "application_applied",
    "scout_run_finished",
})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "type": row["type"],
        "title": row["title"],
        "body": row.get("body"),
        "application_id": row.get("application_id"),
        "scout_run_id": row.get("scout_run_id"),
        "read_at": row.get("read_at"),
        "dismissed_at": row.get("dismissed_at"),
        "created_at": row.get("created_at"),
    }


def _active_notification_query(
    user_id: str,
    *,
    application_id: str | None = None,
    scout_run_id: str | None = None,
    notification_type: str | None = None,
):
    q = (
        supabase.table("notifications")
        .select("id")
        .eq("user_id", user_id)
        .is_("dismissed_at", "null")
    )
    if application_id:
        q = q.eq("application_id", application_id)
    if scout_run_id:
        q = q.eq("scout_run_id", scout_run_id)
    if notification_type:
        q = q.eq("type", notification_type)
    return q


def create_notification(
    user_id: str,
    notification_type: str,
    title: str,
    body: str | None = None,
    *,
    application_id: str | None = None,
    scout_run_id: str | None = None,
) -> dict[str, Any] | None:
    if notification_type not in NOTIFICATION_TYPES:
        raise ValueError(f"invalid notification type: {notification_type}")

    try:
        existing = _active_notification_query(
            user_id,
            application_id=application_id,
            scout_run_id=scout_run_id if not application_id else None,
            notification_type=notification_type,
        ).limit(1).execute()
        if existing.data:
            return _row_to_dict(existing.data[0]) if isinstance(existing.data[0], dict) else None

        payload: dict[str, Any] = {
            "user_id": user_id,
            "type": notification_type,
            "title": title[:500],
            "body": (body or "")[:2000] or None,
            "application_id": application_id,
            "scout_run_id": scout_run_id,
        }
        result = supabase.table("notifications").insert(payload).execute()
        rows = result.data or []
        if not rows:
            return None
        return _row_to_dict(rows[0])
    except Exception as exc:
        logger.warning("create_notification failed: %s", exc)
        return None


def dismissed_application_ids(user_id: str) -> list[str]:
    result = (
        supabase.table("notifications")
        .select("application_id")
        .eq("user_id", user_id)
        .not_.is_("dismissed_at", "null")
        .not_.is_("application_id", "null")
        .execute()
    )
    ids: list[str] = []
    for row in result.data or []:
        if isinstance(row, dict) and row.get("application_id"):
            ids.append(str(row["application_id"]))
    return ids


def list_notifications(user_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
    result = (
        supabase.table("notifications")
        .select(
            "id, user_id, type, title, body, application_id, scout_run_id, "
            "read_at, dismissed_at, created_at"
        )
        .eq("user_id", user_id)
        .is_("dismissed_at", "null")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [_row_to_dict(row) for row in (result.data or []) if isinstance(row, dict)]


def unread_count(user_id: str) -> int:
    result = (
        supabase.table("notifications")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .is_("read_at", "null")
        .is_("dismissed_at", "null")
        .execute()
    )
    return int(result.count or 0)


def _get_owned(user_id: str, notification_id: str) -> dict[str, Any] | None:
    result = (
        supabase.table("notifications")
        .select("id, user_id, read_at, dismissed_at")
        .eq("id", notification_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return result.data if isinstance(result.data, dict) else None


def mark_read(user_id: str, notification_id: str) -> bool:
    row = _get_owned(user_id, notification_id)
    if not row or row.get("read_at"):
        return bool(row)
    supabase.table("notifications").update({"read_at": _now_iso()}).eq(
        "id", notification_id
    ).eq("user_id", user_id).execute()
    return True


def mark_all_read(user_id: str) -> int:
    result = (
        supabase.table("notifications")
        .update({"read_at": _now_iso()})
        .eq("user_id", user_id)
        .is_("read_at", "null")
        .is_("dismissed_at", "null")
        .execute()
    )
    rows = result.data or []
    return len(rows) if isinstance(rows, list) else 0


def dismiss(user_id: str, notification_id: str) -> bool:
    row = _get_owned(user_id, notification_id)
    if not row:
        return False
    if row.get("dismissed_at"):
        return True
    now = _now_iso()
    updates: dict[str, str] = {"dismissed_at": now}
    if not row.get("read_at"):
        updates["read_at"] = now
    supabase.table("notifications").update(updates).eq("id", notification_id).eq(
        "user_id", user_id
    ).execute()
    return True


def dismiss_for_application(user_id: str, application_id: str) -> bool:
    """Dismiss all active notifications for an application (tracker X)."""
    result = (
        supabase.table("notifications")
        .select("id")
        .eq("user_id", user_id)
        .eq("application_id", application_id)
        .is_("dismissed_at", "null")
        .execute()
    )
    rows = result.data or []
    if not rows:
        return False
    now = _now_iso()
    for row in rows:
        if isinstance(row, dict) and row.get("id"):
            dismiss(user_id, row["id"])
    return True
