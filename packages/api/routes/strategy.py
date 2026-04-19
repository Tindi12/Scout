from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/weekly")
async def weekly_strategy() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/followup-template")
async def followup_template_strategy() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
