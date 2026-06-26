"""Emit in-app notifications when application / run status changes."""

from __future__ import annotations

import logging

from core.supabase_client import supabase
from services.notification_service import create_notification

logger = logging.getLogger(__name__)

_TYPE_TITLES = {
    "application_failed": lambda company, role: f"{company} — {role}",
    "application_needs_attention": lambda _c, _r: "Scout needs your answer",
    "application_awaiting_code": lambda _c, _r: "Email verification code needed",
    "application_applied": lambda company, role: f"Application submitted — {company}",
}


def _label(company: str | None, role: str | None) -> tuple[str, str]:
    return (
        (company or "").strip() or "Unknown company",
        (role or "").strip() or "Role",
    )


def notify_application(
    user_id: str,
    application_id: str,
    notification_type: str,
    *,
    scout_run_id: str | None = None,
    body_override: str | None = None,
) -> None:
    try:
        result = (
            supabase.table("applications")
            .select("company, role, error_message, scout_run_id")
            .eq("id", application_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        row = result.data if isinstance(result.data, dict) else None
        if not row:
            return

        company, role = _label(row.get("company"), row.get("role"))
        title_fn = _TYPE_TITLES.get(notification_type)
        title = title_fn(company, role) if title_fn else f"{company} — {role}"
        body = body_override if body_override is not None else row.get("error_message")
        run_id = scout_run_id or row.get("scout_run_id")

        create_notification(
            user_id,
            notification_type,
            title,
            body,
            application_id=application_id,
            scout_run_id=run_id,
        )
    except Exception as exc:
        logger.warning(
            "notify_application failed (app=%s type=%s): %s",
            application_id,
            notification_type,
            exc,
        )


def notify_application_by_id(
    application_id: str,
    notification_type: str,
    *,
    body_override: str | None = None,
) -> None:
    """Look up user_id from the application row (browser agent path)."""
    try:
        result = (
            supabase.table("applications")
            .select("user_id, scout_run_id")
            .eq("id", application_id)
            .maybe_single()
            .execute()
        )
        row = result.data if isinstance(result.data, dict) else None
        if not row or not row.get("user_id"):
            return
        notify_application(
            row["user_id"],
            application_id,
            notification_type,
            scout_run_id=row.get("scout_run_id"),
            body_override=body_override,
        )
    except Exception as exc:
        logger.warning(
            "notify_application_by_id failed (app=%s): %s", application_id, exc
        )


def notify_scout_run_finished(scout_run_id: str) -> None:
    try:
        run_result = (
            supabase.table("scout_runs")
            .select(
                "id, user_id, applied_count, failed_count, "
                "needs_attention_count, status"
            )
            .eq("id", scout_run_id)
            .maybe_single()
            .execute()
        )
        run = run_result.data if isinstance(run_result.data, dict) else None
        if not run:
            return

        user_id = run["user_id"]
        applied = int(run.get("applied_count") or 0)
        failed = int(run.get("failed_count") or 0)
        attention = int(run.get("needs_attention_count") or 0)
        status = run.get("status") or "completed"
        body = f"{applied} applied, {failed} failed, {attention} need attention"
        title = (
            "Scout run finished"
            if status == "completed"
            else "Scout run failed"
        )

        create_notification(
            user_id,
            "scout_run_finished",
            title,
            body,
            application_id=None,
            scout_run_id=scout_run_id,
        )
    except Exception as exc:
        logger.warning(
            "notify_scout_run_finished failed (run=%s): %s", scout_run_id, exc
        )
