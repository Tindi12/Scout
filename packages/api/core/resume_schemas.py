"""Pydantic schemas that validate AI-generated resume structure and scores.

These guard the resume pipeline against malformed or prompt-injected model output
before it reaches the database, the scorer, or the client:

- ``ParsedResume`` normalizes the structurer's output to a known shape — extra
  keys stripped, missing keys defaulted, scalars coerced. It is lenient: the goal
  is a clean, complete dict, not rejection (a resume that parsed before still does).
- ``ResumeScore`` is strict: a score outside 0-100 or a breakdown dimension outside
  0-25 is rejected, since those values flow straight into the DB and the UI. The
  total is reconciled to the breakdown sum (the granular source of truth), which
  also neutralizes an injected score that disagrees with its breakdown.
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lenient coercion helpers (used by the structurer schema)
# ---------------------------------------------------------------------------
def _to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    return ""


def _to_opt_str(value: Any) -> str | None:
    if value is None:
        return None
    return _to_str(value) or None


def _to_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [s for s in (_to_str(item) for item in value) if s]


def _to_dict_list(value: Any) -> list[dict]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


# ---------------------------------------------------------------------------
# ParsedResume — lenient normalization of structurer output
# ---------------------------------------------------------------------------
class Education(BaseModel):
    model_config = ConfigDict(extra="ignore")

    school: str = ""
    degree: str = ""
    field: str = ""
    gpa: float | None = None
    start_date: str | None = None
    end_date: str | None = None
    relevant_coursework: list[str] = Field(default_factory=list)

    @field_validator("school", "degree", "field", mode="before")
    @classmethod
    def _str(cls, v: Any) -> str:
        return _to_str(v)

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def _opt_str(cls, v: Any) -> str | None:
        return _to_opt_str(v)

    @field_validator("gpa", mode="before")
    @classmethod
    def _gpa(cls, v: Any) -> float | None:
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    @field_validator("relevant_coursework", mode="before")
    @classmethod
    def _list(cls, v: Any) -> list[str]:
        return _to_str_list(v)


class Experience(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company: str = ""
    title: str = ""
    start_date: str | None = None
    end_date: str | None = None
    bullets: list[str] = Field(default_factory=list)

    @field_validator("company", "title", mode="before")
    @classmethod
    def _str(cls, v: Any) -> str:
        return _to_str(v)

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def _opt_str(cls, v: Any) -> str | None:
        return _to_opt_str(v)

    @field_validator("bullets", mode="before")
    @classmethod
    def _list(cls, v: Any) -> list[str]:
        return _to_str_list(v)


class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = ""
    tech_stack: list[str] = Field(default_factory=list)
    start_date: str | None = None
    end_date: str | None = None
    bullets: list[str] = Field(default_factory=list)

    @field_validator("name", mode="before")
    @classmethod
    def _str(cls, v: Any) -> str:
        return _to_str(v)

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def _opt_str(cls, v: Any) -> str | None:
        return _to_opt_str(v)

    @field_validator("tech_stack", "bullets", mode="before")
    @classmethod
    def _list(cls, v: Any) -> list[str]:
        return _to_str_list(v)


class Skills(BaseModel):
    model_config = ConfigDict(extra="ignore")

    languages: list[str] = Field(default_factory=list)
    frameworks: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)

    @field_validator("languages", "frameworks", "tools", "platforms", mode="before")
    @classmethod
    def _list(cls, v: Any) -> list[str]:
        return _to_str_list(v)


class ParsedResume(BaseModel):
    """Structured resume the parse LLM is asked to produce (parse_prompt.txt)."""

    model_config = ConfigDict(extra="ignore")

    name: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str | None = None
    github: str | None = None
    education: list[Education] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    skills: Skills = Field(default_factory=Skills)

    @field_validator("name", "email", "phone", mode="before")
    @classmethod
    def _str(cls, v: Any) -> str:
        return _to_str(v)

    @field_validator("linkedin", "github", mode="before")
    @classmethod
    def _opt_str(cls, v: Any) -> str | None:
        return _to_opt_str(v)

    @field_validator("education", "experience", "projects", mode="before")
    @classmethod
    def _entries(cls, v: Any) -> list[dict]:
        return _to_dict_list(v)

    @field_validator("skills", mode="before")
    @classmethod
    def _skills(cls, v: Any) -> dict:
        return v if isinstance(v, dict) else {}


# ---------------------------------------------------------------------------
# ResumeScore — strict validation of scorer output
# ---------------------------------------------------------------------------
class ScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="ignore")

    experience: int = Field(ge=0, le=25)
    metrics: int = Field(ge=0, le=25)
    structure: int = Field(ge=0, le=25)
    keywords: int = Field(ge=0, le=25)

    def total(self) -> int:
        return self.experience + self.metrics + self.structure + self.keywords


class Weakness(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: str = ""
    severity: str = ""
    message: str = ""
    suggestion: str = ""

    @field_validator("type", "severity", "message", "suggestion", mode="before")
    @classmethod
    def _str(cls, v: Any) -> str:
        return _to_str(v)


class ResumeScore(BaseModel):
    """Resume score the scoring LLM is asked to produce (score_prompt.txt)."""

    model_config = ConfigDict(extra="ignore")

    score: int = Field(ge=0, le=100)
    breakdown: ScoreBreakdown
    weaknesses: list[Weakness] = Field(default_factory=list)

    @field_validator("weaknesses", mode="before")
    @classmethod
    def _weaknesses(cls, v: Any) -> list[dict]:
        return _to_dict_list(v)

    @model_validator(mode="after")
    def _reconcile_score(self) -> "ResumeScore":
        total = self.breakdown.total()
        if self.score != total:
            logger.warning(
                "Resume score %s != breakdown sum %s; using breakdown sum",
                self.score,
                total,
            )
            self.score = total
        return self
