from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/create-checkout-session")
async def create_checkout_session() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/webhook")
async def stripe_webhook() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/create-portal-session")
async def create_portal_session() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
