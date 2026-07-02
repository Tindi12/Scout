from fastapi import APIRouter, Depends, HTTPException

from core.auth import verify_resume_api_user

router = APIRouter()


@router.post("/weekly")
async def weekly_strategy(
    current_user: dict = Depends(verify_resume_api_user),
) -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/followup-template")
async def followup_template_strategy(
    current_user: dict = Depends(verify_resume_api_user),
) -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
