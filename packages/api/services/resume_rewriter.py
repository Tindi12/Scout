import json
import logging
from pathlib import Path

from fastapi import HTTPException

from core.ai_json import parse_ai_json_object
from core.ai_router import call_ai

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

_REQUIRED_TOP_LEVEL = (
    "name",
    "email",
    "education",
    "experience",
    "projects",
    "skills",
)


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8")


def _validate_jake_resume(result: dict, *, context: str = "Rewrite AI") -> None:
    for key in _REQUIRED_TOP_LEVEL:
        if key not in result:
            raise HTTPException(
                status_code=500,
                detail=f"{context} missing required field: {key}",
            )

    if not isinstance(result["education"], list):
        raise HTTPException(
            status_code=500,
            detail=f"{context} education must be a list",
        )
    if not isinstance(result["experience"], list):
        raise HTTPException(
            status_code=500,
            detail=f"{context} experience must be a list",
        )
    if not isinstance(result["projects"], list):
        raise HTTPException(
            status_code=500,
            detail=f"{context} projects must be a list",
        )
    if not isinstance(result["skills"], dict):
        raise HTTPException(
            status_code=500,
            detail=f"{context} skills must be an object",
        )


class ResumeRewriter:
    async def _rewrite_with_prompt(
        self,
        *,
        prompt_file: str,
        user_prompt: str,
        context: str,
    ) -> dict:
        system = _load_prompt(prompt_file)

        ai_response = await call_ai(
            prompt=user_prompt,
            system=system,
            task="quality",
        )

        if ai_response is None or not str(ai_response).strip():
            raise HTTPException(status_code=500, detail="AI returned empty response")

        result = parse_ai_json_object(str(ai_response), context=context)
        _validate_jake_resume(result, context=context)
        return result

    async def general_rewrite(self, parsed_resume: dict) -> dict:
        return await self._rewrite_with_prompt(
            prompt_file="rewrite_prompt.txt",
            user_prompt=json.dumps(parsed_resume),
            context="General rewrite AI",
        )

    async def jd_specific_rewrite(
        self,
        parsed_resume: dict,
        job_description: str,
    ) -> dict:
        user_prompt = (
            f"Job Description:\n{job_description}\n\n"
            f"Resume:\n{json.dumps(parsed_resume)}"
        )
        return await self._rewrite_with_prompt(
            prompt_file="jd_optimize_prompt.txt",
            user_prompt=user_prompt,
            context="JD optimize AI",
        )


resume_rewriter = ResumeRewriter()
