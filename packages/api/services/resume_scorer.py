import json
import logging
from pathlib import Path

from fastapi import HTTPException

from core.ai_router import call_ai

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8")


class ResumeScorer:
    async def score_resume(self, parsed_resume: dict, target_role: str) -> dict:
        system = _load_prompt("score_prompt.txt")
        user_prompt = (
            f"Target role: {target_role}\n\nResume:\n{json.dumps(parsed_resume)}"
        )

        ai_response = await call_ai(
            prompt=user_prompt,
            system=system,
            task="fast",
        )

        if ai_response is None or not str(ai_response).strip():
            raise HTTPException(status_code=500, detail="AI returned empty response")

        try:
            result = json.loads(str(ai_response).strip())
        except json.JSONDecodeError:
            logger.exception("Score AI returned invalid JSON")
            raise HTTPException(status_code=500, detail="AI returned invalid JSON")

        if not isinstance(result, dict):
            raise HTTPException(status_code=500, detail="AI returned invalid score shape")

        if (
            "score" not in result
            or "breakdown" not in result
            or "weaknesses" not in result
        ):
            raise HTTPException(
                status_code=500, detail="AI score missing required fields"
            )

        breakdown = result["breakdown"]
        if not isinstance(breakdown, dict):
            raise HTTPException(status_code=500, detail="AI score breakdown invalid")

        for key in ("experience", "metrics", "structure", "keywords"):
            if key not in breakdown:
                raise HTTPException(
                    status_code=500,
                    detail="AI score breakdown missing dimension",
                )

        if not isinstance(result["weaknesses"], list):
            raise HTTPException(status_code=500, detail="AI weaknesses must be a list")

        return result


resume_scorer = ResumeScorer()
