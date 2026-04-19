from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/parse")
async def parse_resume() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/score")
async def score_resume() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/analyze")
async def analyze_resume() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/rewrite")
async def rewrite_resume() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/rewrite-for-job")
async def rewrite_resume_for_job() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/pdf")
async def generate_resume_pdf() -> dict[str, str]:
    raise HTTPException(status_code=501, detail="Not implemented")
