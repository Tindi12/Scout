"""
LLM selection for Scout's browser apply agent (browser-use Agent).

Other Scout features still use core.ai_router (Gemini / Groq). This module is
only imported by services.browser_agent.

Primary is the browser-use ChatBrowserUse gateway (SCOUT_BROWSER_LLM=browser_use,
the default): a model tuned for browser-agent steps that cuts per-step inference
latency ~6x vs a general chat model — the old engine's 5-11 min applies were
inference-bound on gpt-5.4-mini. Requires BROWSER_USE_API_KEY; when the key is
missing (or SCOUT_BROWSER_LLM=openai) the engine runs on the proven OpenAI path.
The step-level fallback LLM stays on OpenAI either way, so a gateway outage
degrades to the old engine instead of failing applies.
"""

from __future__ import annotations

import logging
import os
import re

from browser_use import ChatBrowserUse
from browser_use.llm.exceptions import ModelProviderError
from browser_use.llm.openai.chat import ChatOpenAI
from browser_use.llm.views import ChatInvokeCompletion
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

BROWSER_AGENT_MODEL = "gpt-5.4-mini"
# gpt-4o as fallback for non-parse failures (e.g. session loss, API errors).
# gpt-4o-mini is too weak for multi-step agentic form-filling.
BROWSER_AGENT_FALLBACK_MODEL = "gpt-4o"
# ChatBrowserUse gateway model (browser-use's browser-agent-tuned model).
BROWSER_USE_GATEWAY_MODEL = os.getenv("SCOUT_BROWSER_USE_MODEL", "bu-2-0")


def _extract_first_json_object(text: str) -> str:
    """
    Return the first complete JSON object from text, stripping markdown fences
    and any trailing content after the closing brace.
    """
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text).strip()
    start = text.find("{")
    if start == -1:
        return text
    depth = 0
    in_string = False
    i = start
    while i < len(text):
        c = text[i]
        if c == "\\" and in_string:
            i += 2
            continue
        if c == '"':
            in_string = not in_string
        elif not in_string:
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        i += 1
    return text[start:]


class _RobustChatOpenAI(ChatOpenAI):
    """
    Thin subclass of browser-use's ChatOpenAI that recovers from trailing-character
    JSON parse errors without switching to a weaker fallback model.

    Root cause: gpt-5.4-mini with strict json_schema mode occasionally appends a
    brief comment after the closing brace, causing Pydantic's model_validate_json
    to raise "Invalid JSON: trailing characters at line 2 column 1". This is
    intermittent and independent of reasoning_models / use_thinking settings.

    Recovery: on parse failure, makes a second call in text mode (no json_schema
    constraint) and extracts the JSON object manually. The second call uses the
    same capable model so agentic quality is preserved.
    """

    async def ainvoke(self, messages, output_format=None, **kwargs):
        if output_format is None:
            return await super().ainvoke(messages, output_format, **kwargs)
        try:
            return await super().ainvoke(messages, output_format, **kwargs)
        except ModelProviderError as exc:
            if "trailing characters" not in str(exc).lower():
                raise
            # Primary call returned valid JSON + trailing text that strict-mode
            # should have prevented. Recover by getting the raw text and
            # extracting the JSON object ourselves.
            raw = await super().ainvoke(messages, output_format=None, **kwargs)
            json_str = _extract_first_json_object(raw.completion)
            parsed = output_format.model_validate_json(json_str)
            return ChatInvokeCompletion(
                completion=parsed,
                usage=raw.usage,
                stop_reason=raw.stop_reason,
            )


def _openai_primary(temperature: float) -> _RobustChatOpenAI:
    """
    OpenAI primary for browser automation steps.

    reasoning_models=[] prevents browser-use from treating gpt-5.4-mini as a
    reasoning model (it substring-matches 'gpt-5' by default), which would strip
    temperature and add reasoning_effort — neither of which we want for
    deterministic, low-latency form filling.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY must be set for the browser agent "
            "(or set BROWSER_USE_API_KEY and SCOUT_BROWSER_LLM=browser_use)"
        )
    return _RobustChatOpenAI(
        model=BROWSER_AGENT_MODEL,
        api_key=api_key,
        temperature=temperature,
        reasoning_models=[],
    )


def ScoutBrowserLLM(*, temperature: float = 0, task: str = ""):
    """
    Primary LLM for browser automation steps: ChatBrowserUse gateway by default,
    OpenAI when SCOUT_BROWSER_LLM=openai or BROWSER_USE_API_KEY is missing.
    """
    _ = task
    provider = os.getenv("SCOUT_BROWSER_LLM", "browser_use").strip().lower()
    if provider == "browser_use":
        if os.getenv("BROWSER_USE_API_KEY"):
            return ChatBrowserUse(model=BROWSER_USE_GATEWAY_MODEL)
        logger.warning(
            "SCOUT_BROWSER_LLM=browser_use but BROWSER_USE_API_KEY is not set — "
            "falling back to the OpenAI browser LLM (slower)."
        )
    return _openai_primary(temperature)


def ScoutBrowserFallbackLLM(*, temperature: float = 0) -> _RobustChatOpenAI | None:
    """
    Fallback LLM for browser-use step-level failures unrelated to JSON parsing
    (e.g. API errors, session loss, the primary model genuinely failing a step).
    Deliberately a DIFFERENT provider than the gateway primary so a ChatBrowserUse
    outage degrades instead of failing. None when OPENAI_API_KEY is absent (the
    Agent then runs without a step-level fallback).

    Uses gpt-4o rather than gpt-4o-mini: gpt-4o-mini lacks the agentic reasoning
    needed to navigate multi-step application forms reliably.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    return _RobustChatOpenAI(
        model=BROWSER_AGENT_FALLBACK_MODEL,
        api_key=api_key,
        temperature=temperature,
        reasoning_models=[],
    )
