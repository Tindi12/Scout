from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr

from core.auth import verify_internal_service
from core.newsletter import subscribe

router = APIRouter()


class NewsletterSubscribeRequest(BaseModel):
    email: EmailStr


class NewsletterSubscribeResponse(BaseModel):
    status: str


@router.post(
    "/subscribe",
    response_model=NewsletterSubscribeResponse,
    dependencies=[Depends(verify_internal_service)],
)
async def newsletter_subscribe(
    body: NewsletterSubscribeRequest,
) -> NewsletterSubscribeResponse:
    result = await run_in_threadpool(subscribe, body.email)
    if result == "failed":
        raise HTTPException(
            status_code=502,
            detail="Could not subscribe right now. Please try again in a bit.",
        )
    return NewsletterSubscribeResponse(status=result)
