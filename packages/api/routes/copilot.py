from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/chat")
async def copilot_chat() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
