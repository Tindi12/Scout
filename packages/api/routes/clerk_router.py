from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/webhook")
async def clerk_webhook() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
