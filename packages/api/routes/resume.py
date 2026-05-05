import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.ai_router import call_ai
from core.auth import verify_clerk_jwt
from core.supabase_client import supabase
from services.resume_parser import resume_parser
from services.resume_scorer import resume_scorer

router = APIRouter()


def load_prompt(name: str) -> str:
    path = Path(__file__).parent.parent / "prompts" / name
    return path.read_text(encoding="utf-8")


class ParseResumeRequest(BaseModel):
    resume_id: str

class ScoreResumeRequest(BaseModel):
    resume_id: str
    target_role: str


@router.post("/parse")
async def parse_resume(
    request: ParseResumeRequest,
    current_user: dict = Depends(verify_clerk_jwt),
) -> dict:
    resume = (
        supabase.table("resumes")
        .select("storage_path, file_type, users!inner(clerk_id)")
        .eq("id", request.resume_id)
        .execute()
    )

    rows = resume.data
    if not rows:
        raise HTTPException(status_code=404, detail="Resume not found")

    row = rows[0]
    users_row = row.get("users")
    if not users_row or users_row.get("clerk_id") != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    storage_path = row["storage_path"]
    file_type = row["file_type"]

    raw_text = await resume_parser.parse_resume(storage_path, file_type)
    parse_prompt = load_prompt("parse_prompt.txt")
    ai_response = await call_ai(prompt=raw_text, system=parse_prompt, task="fast")

    if ai_response is None or not str(ai_response).strip():
        raise HTTPException(status_code=500, detail="AI returned empty response")

    try:
        parsed = json.loads(str(ai_response).strip())
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON")

    supabase.table("resumes").update({"parsed_content": parsed}).eq(
        "id", request.resume_id
    ).execute()

    return parsed


@router.post("/score")
async def score_resume(request: ScoreResumeRequest, current_user: dict = Depends(verify_clerk_jwt)) -> dict:
    resume = (
        supabase.table("resumes")
        .select("parsed_content, user_id, users!inner(clerk_id)")
        .eq("id", request.resume_id)
        .execute()
    )

    rows = resume.data
    if not rows:
        raise HTTPException(status_code=404, detail="Resume not found")

    row = rows[0]
    users_row = row.get("users")
    if not users_row or users_row.get("clerk_id") != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    parsed_content = row["parsed_content"]
    if parsed_content is None:
        raise HTTPException(
            status_code=422,
            detail="Resume must be parsed first. Call POST /resume/parse.",
        )

    if isinstance(parsed_content, str):
        try:
            parsed_content = json.loads(parsed_content)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=422,
                detail="Parsed resume is invalid; run POST /resume/parse again.",
            )

    if not isinstance(parsed_content, dict):
        raise HTTPException(
            status_code=422,
            detail="Parsed resume is invalid; run POST /resume/parse again.",
        )

    result = await resume_scorer.score_resume(parsed_content, request.target_role)

    supabase.table("analyses").insert(
        {
            "user_id": row["user_id"],
            "resume_id": request.resume_id,
            "target_role": request.target_role,
            "score": result["score"],
            "breakdown": result["breakdown"],
            "weaknesses": result["weaknesses"],
            "rewritten_resume": None,
            "before_after": [],
        }
    ).execute()

    return result


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
