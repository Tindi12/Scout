import logging

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from core.auth import verify_resume_api_user
from core.supabase_client import supabase
from services import notification_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_user_id(clerk_id: str) -> str | None:
    result = (
        supabase.table("users")
        .select("id")
        .eq("clerk_id", clerk_id)
        .maybe_single()
        .execute()
    )
    if not result.data or not isinstance(result.data, dict):
        return None
    return result.data.get("id")


@router.get("/")
async def list_notifications(
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    clerk_id = current_user["sub"]

    def _fetch() -> dict:
        user_id = _resolve_user_id(clerk_id)
        if not user_id:
            return {"notifications": [], "unread_count": 0, "dismissed_application_ids": []}
        items = notification_service.list_notifications(user_id)
        count = notification_service.unread_count(user_id)
        dismissed = notification_service.dismissed_application_ids(user_id)
        return {
            "notifications": items,
            "unread_count": count,
            "dismissed_application_ids": dismissed,
        }

    return await run_in_threadpool(_fetch)


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    clerk_id = current_user["sub"]

    def _mark() -> dict:
        user_id = _resolve_user_id(clerk_id)
        if not user_id:
            raise ValueError("user_not_found")
        ok = notification_service.mark_read(user_id, notification_id)
        if not ok:
            raise ValueError("not_found")
        return {"success": True}

    try:
        return await run_in_threadpool(_mark)
    except ValueError as exc:
        if str(exc) == "user_not_found":
            raise HTTPException(status_code=404, detail="User not found") from exc
        raise HTTPException(status_code=404, detail="Notification not found") from exc


@router.post("/mark-all-read")
async def mark_all_notifications_read(
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    clerk_id = current_user["sub"]

    def _mark_all() -> dict:
        user_id = _resolve_user_id(clerk_id)
        if not user_id:
            return {"updated": 0}
        updated = notification_service.mark_all_read(user_id)
        return {"updated": updated}

    return await run_in_threadpool(_mark_all)


@router.patch("/{notification_id}/dismiss")
async def dismiss_notification(
    notification_id: str,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    clerk_id = current_user["sub"]

    def _dismiss() -> dict:
        user_id = _resolve_user_id(clerk_id)
        if not user_id:
            raise ValueError("user_not_found")
        ok = notification_service.dismiss(user_id, notification_id)
        if not ok:
            raise ValueError("not_found")
        return {"success": True}

    try:
        return await run_in_threadpool(_dismiss)
    except ValueError as exc:
        if str(exc) == "user_not_found":
            raise HTTPException(status_code=404, detail="User not found") from exc
        raise HTTPException(status_code=404, detail="Notification not found") from exc


@router.patch("/by-application/{application_id}/dismiss")
async def dismiss_notification_for_application(
    application_id: str,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    clerk_id = current_user["sub"]

    def _dismiss() -> dict:
        user_id = _resolve_user_id(clerk_id)
        if not user_id:
            raise ValueError("user_not_found")
        notification_service.dismiss_for_application(user_id, application_id)
        return {"success": True}

    try:
        return await run_in_threadpool(_dismiss)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="User not found") from exc


@router.post("/followup-template")
async def followup_template_notification() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
