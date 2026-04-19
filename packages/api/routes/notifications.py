from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/followup-template")
async def followup_template_notification() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
