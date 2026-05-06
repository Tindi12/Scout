"""Parse JSON objects from LLM output (often wrapped in ``` fences or prose despite prompts)."""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import HTTPException


def strip_markdown_json_fence(raw: str) -> str:
    s = str(raw).strip()
    if not s.startswith("```"):
        return s
    lines = s.split("\n")
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    while lines and lines[-1].strip().startswith("```"):
        lines.pop()
    return "\n".join(lines).strip()


def _extract_first_json_object(s: str) -> Optional[str]:
    """Return the first top-level balanced {...} substring in s, ignoring braces inside strings."""
    in_str = False
    escape = False
    depth = 0
    start = -1
    for i, ch in enumerate(s):
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start >= 0:
                    return s[start : i + 1]
    return None


def parse_ai_json_object(raw: str, *, context: str = "AI") -> dict[str, Any]:
    s = strip_markdown_json_fence(raw)

    try:
        out = json.loads(s)
        if isinstance(out, dict):
            return out
        raise HTTPException(
            status_code=500,
            detail=f"{context} returned non-object JSON",
        )
    except json.JSONDecodeError:
        pass

    extracted = _extract_first_json_object(s)
    if extracted:
        try:
            out = json.loads(extracted)
            if isinstance(out, dict):
                return out
        except json.JSONDecodeError:
            pass

    raise HTTPException(
        status_code=500,
        detail=f"{context} returned invalid JSON",
    )
