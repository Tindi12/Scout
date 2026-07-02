from fastapi import APIRouter, Depends, HTTPException

from core.auth import verify_resume_api_user

router = APIRouter()


@router.post("/run")
async def run_scout(
    current_user: dict = Depends(verify_resume_api_user),
) -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/status/{run_id}")
async def scout_run_status(
    run_id: str,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
