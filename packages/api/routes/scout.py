from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/run")
async def run_scout() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/status/{run_id}")
async def scout_run_status(run_id: str) -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
