from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/")
async def list_jobs() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/match")
async def match_jobs() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
