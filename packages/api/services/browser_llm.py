"""
LLM selection for Scout's browser apply agent (browser-use Agent).

Other Scout features still use core.ai_router (Gemini / Groq). This module is
only imported by services.browser_agent.

Scout currently runs the OpenAI path as the deliberate primary
(SCOUT_BROWSER_LLM=openai): gpt-5.5 decodes each step under strict json_schema
mode. The ChatBrowserUse gateway remains available behind
SCOUT_BROWSER_LLM=browser_use + BROWSER_USE_API_KEY as a future option.

Postmortem 2026-07-09 (Docugami Greenhouse): the then-primary gpt-5.4-mini's
strict json_schema call failed with "trailing characters" on 9/14 steps, and the
old recovery re-generated the step in UNCONSTRAINED text mode — where the mini
model cannot reproduce browser-use's action-union schema. Result: schema-valid-
but-wrong actions (bare `navigate`) that diverged from the model's own stated
intent and looped the agent. The 2026-07-09 verification run then showed the
mini failing strict decode DETERMINISTICALLY on essentially every step (temp 0 —
the same-model retry never rescued once) with gpt-5.5 decoding every step anyway
at 3 LLM calls/step, so the mini first-attempt was dropped: gpt-5.5 is now the
primary. The recovery ladder never drops the schema constraint:

  0. client-side JSON repair — the dominant strict failure ("trailing
     characters": a complete, schema-valid JSON object followed by stray
     text/a second object) is fixed by extracting the FIRST JSON value and
     validating it, with no extra LLM call. Postmortem 2026-07-10
     (Tenstorrent Greenhouse): this failure fired on 9/40 steps; the retry
     rescued 4, but on 5 steps the retry failed identically (near-
     deterministic at fixed context), escalation was skipped (same model),
     and the plain fallback LLM failed the same way — burning 5 whole agent
     steps and the run's step budget.
  1. strict json_schema call on the primary model (gpt-5.5)
  2. same strict call retried once (parse failures can be transient)
  3. strict escalation to SCOUT_BROWSER_ESCALATION_MODEL — skipped when it is
     the same model as the primary (it is, by default)
  4. raise — a real failure signal browser-use's step-retry/fallback_llm can
     act on, instead of a silently corrupted "success"

Every recovery stage emits a Sentry event so a 64%-style strict-failure rate
is visible, and each step is tagged with the path/model that actually produced
the executed action (browser_llm_step_source).
"""

from __future__ import annotations

import json
import logging
import os

import sentry_sdk
from browser_use import ChatBrowserUse
from browser_use.llm.exceptions import ModelProviderError
from browser_use.llm.openai.chat import ChatOpenAI
from dotenv import load_dotenv
from pydantic import ValidationError

load_dotenv()

logger = logging.getLogger(__name__)

# Primary step-decode model. gpt-5.5 (full tier) — structured-output reliability
# is the load-bearing requirement here; gpt-5.4-mini failed strict decode on
# ~every step of the 2026-07-09 run and was dropped. gpt-4o (the pre-postmortem
# fallback) is retired from ChatGPT and its API snapshots are on a 2026-10-23
# shutdown path; OpenAI's deprecations page names gpt-5.5 as the replacement.
BROWSER_AGENT_MODEL = os.getenv("SCOUT_BROWSER_MODEL", "gpt-5.5")
# Strict-schema escalation for steps the primary cannot decode; skipped when it
# equals the primary (the default). Point it at a stronger tier (e.g.
# gpt-5.5-pro) to A/B a two-tier ladder.
BROWSER_AGENT_ESCALATION_MODEL = os.getenv("SCOUT_BROWSER_ESCALATION_MODEL", "gpt-5.5")
BROWSER_AGENT_FALLBACK_MODEL = os.getenv("SCOUT_BROWSER_FALLBACK_MODEL", "gpt-5.5")
# ChatBrowserUse gateway model (browser-use's browser-agent-tuned model).
BROWSER_USE_GATEWAY_MODEL = os.getenv("SCOUT_BROWSER_USE_MODEL", "bu-2-0")

# ModelProviderError messages that mean "the model's output failed schema
# parsing/validation" — the only failures the recovery ladder should absorb.
# API/transport errors (429, 5xx, timeouts) propagate immediately so
# browser-use's own step retry / fallback_llm handles them.
_PARSE_FAILURE_MARKERS = (
    "trailing characters",
    "invalid json",
    "failed to parse structured output",
    "validation error",
)


def _is_parse_failure(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(marker in msg for marker in _PARSE_FAILURE_MARKERS)


def _tag_step_source(source: str) -> None:
    """
    Tag the current Sentry scope with the path/model that produced this step's
    executed action (strict | strict_retry | escalated:<model>), so apply
    quality can be segmented by decode path. No-op when Sentry is not
    initialized.
    """
    sentry_sdk.set_tag("browser_llm_step_source", source)


def _report_recovery(stage: str, model: str, exc: Exception) -> None:
    """One Sentry event per recovery-ladder stage that fires — this is the
    signal that was invisible in the 2026-07-09 incident."""
    logger.warning(
        "browser LLM strict decode failed; recovery stage=%s model=%s: %s",
        stage,
        model,
        exc,
    )
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("browser_llm_recovery_stage", stage)
        scope.set_tag("browser_llm_recovery_model", model)
        scope.set_level("warning")
        sentry_sdk.capture_message(
            f"browser LLM strict-decode recovery fired: stage={stage} model={model}"
        )


def _report_json_repair(exc: Exception) -> None:
    """Client-side repair fired instead of an LLM retry — cheap, but worth
    counting: a rising rate means the model is drifting on strict mode."""
    logger.info(
        "browser LLM strict decode repaired client-side (first JSON object "
        "extracted): %s",
        exc,
    )
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("browser_llm_recovery_stage", "json_repair")
        scope.set_level("info")
        sentry_sdk.capture_message(
            "browser LLM strict-decode repaired client-side (trailing characters)"
        )


def _extract_first_json_value(raw: str | bytes | bytearray):
    """
    First complete JSON value in `raw`, or None. Handles the observed gpt-5.5
    strict-mode failure: a valid JSON object on line 1 followed by trailing
    characters ("Invalid JSON: trailing characters at line 2 column 1").
    """
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode()
        except UnicodeDecodeError:
            return None
    try:
        value, _ = json.JSONDecoder().raw_decode(raw.lstrip())
    except json.JSONDecodeError:
        return None
    return value


# One repairing subclass per browser-use output schema (AgentOutput variants
# are built dynamically per agent), cached so pydantic model creation runs once.
_repairing_formats: dict[type, type] = {}


def _with_json_repair(output_format: type) -> type:
    """
    Subclass of `output_format` whose model_validate_json falls back to
    extracting the first JSON value when strict parsing rejects trailing
    characters. browser-use's ChatOpenAI only uses the class for its JSON
    schema (identical in the subclass) and this classmethod; the parsed
    instance is always of the ORIGINAL class, so agent-side isinstance checks
    are unaffected.
    """
    cached = _repairing_formats.get(output_format)
    if cached is not None:
        return cached

    class _RepairingFormat(output_format):  # type: ignore[misc, valid-type]
        @classmethod
        def model_validate_json(cls, json_data, **kwargs):
            try:
                return output_format.model_validate_json(json_data, **kwargs)
            except ValidationError as exc:
                value = _extract_first_json_value(json_data)
                if value is None:
                    raise
                # Schema-mismatch (not trailing-junk) failures raise here and
                # propagate to the model-retry ladder.
                parsed = output_format.model_validate(value)
                _report_json_repair(exc)
                return parsed

    _repairing_formats[output_format] = _RepairingFormat
    return _RepairingFormat


# Lazily-built escalation client, shared across steps/instances in the worker.
_escalation_llm: ChatOpenAI | None = None


def _get_escalation_llm() -> ChatOpenAI:
    """
    Full-tier strict-schema escalation model. Deliberately a plain ChatOpenAI
    (no further recovery ladder) with browser-use's default reasoning-model
    handling: 'gpt-5' substring-matches the default reasoning_models list, so
    temperature is stripped and reasoning_effort is sent — the correct params
    for the GPT-5 full tier.
    """
    global _escalation_llm
    if _escalation_llm is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY must be set for the browser agent")
        _escalation_llm = ChatOpenAI(
            model=BROWSER_AGENT_ESCALATION_MODEL,
            api_key=api_key,
        )
    return _escalation_llm


class _RobustChatOpenAI(ChatOpenAI):
    """
    ChatOpenAI subclass whose recovery from structured-output parse failures
    NEVER drops the json_schema constraint (see module docstring for the
    incident this prevents). Ladder: client-side JSON repair → strict →
    strict retry → full-model strict escalation → raise.
    """

    async def ainvoke(self, messages, output_format=None, **kwargs):
        if output_format is None:
            return await super().ainvoke(messages, output_format, **kwargs)
        # Stage 0 rides inside every strict call below: trailing-characters
        # output is repaired during parsing, before any model retry.
        output_format = _with_json_repair(output_format)
        try:
            result = await super().ainvoke(messages, output_format, **kwargs)
            _tag_step_source("strict")
            return result
        except ModelProviderError as exc:
            if not _is_parse_failure(exc):
                raise
            _report_recovery("strict_retry", str(self.model), exc)

        # Stage 2: same model, same strict json_schema call — parse failures
        # can be transient, so a constrained retry may succeed without
        # changing models.
        try:
            result = await super().ainvoke(messages, output_format, **kwargs)
            _tag_step_source("strict_retry")
            return result
        except ModelProviderError as exc:
            if not _is_parse_failure(exc):
                raise
            # Stage 3 only exists when a DIFFERENT escalation model is
            # configured — a third identical call to the same model is waste.
            if str(self.model) == BROWSER_AGENT_ESCALATION_MODEL:
                raise
            _report_recovery("escalation", BROWSER_AGENT_ESCALATION_MODEL, exc)

        # Stage 3: escalation model, schema still enforced. If THIS fails
        # validation, the ModelProviderError propagates — browser-use's step
        # retry / fallback_llm takes over from a real failure signal rather
        # than receiving a degenerate-but-valid action.
        result = await _get_escalation_llm().ainvoke(messages, output_format, **kwargs)
        _tag_step_source(f"escalated:{BROWSER_AGENT_ESCALATION_MODEL}")
        return result


def _openai_primary() -> _RobustChatOpenAI:
    """
    OpenAI primary for browser automation steps. Built with browser-use's
    DEFAULT reasoning-model handling: 'gpt-5' substring-matches the default
    reasoning_models list, so temperature is stripped and reasoning_effort is
    sent — the params the GPT-5 full tier requires (it rejects temperature).
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
    )


def ScoutBrowserLLM(*, temperature: float = 0, task: str = ""):
    """
    Primary LLM for browser automation steps: OpenAI path (Scout's current
    deliberate choice) unless SCOUT_BROWSER_LLM=browser_use with
    BROWSER_USE_API_KEY set selects the ChatBrowserUse gateway.

    `temperature` is accepted for caller compatibility but unused on the OpenAI
    path — the GPT-5 full tier rejects temperature (reasoning handling strips it).
    """
    _ = task, temperature
    provider = os.getenv("SCOUT_BROWSER_LLM", "browser_use").strip().lower()
    if provider == "browser_use":
        if os.getenv("BROWSER_USE_API_KEY"):
            sentry_sdk.set_tag("browser_llm_provider", "browser_use")
            return ChatBrowserUse(model=BROWSER_USE_GATEWAY_MODEL)
        logger.warning(
            "SCOUT_BROWSER_LLM=browser_use but BROWSER_USE_API_KEY is not set — "
            "falling back to the OpenAI browser LLM."
        )
    # Visibility: we want every worker boot on the OpenAI path to be
    # segmentable in Sentry (this path's recovery ladder is the component
    # that failed on 2026-07-09).
    sentry_sdk.set_tag("browser_llm_provider", "openai")
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("browser_llm_provider", "openai")
        scope.set_tag("browser_llm_model", BROWSER_AGENT_MODEL)
        scope.set_level("info")
        sentry_sdk.capture_message(
            "Scout browser LLM running on the OpenAI path "
            f"(primary={BROWSER_AGENT_MODEL}, escalation={BROWSER_AGENT_ESCALATION_MODEL})"
        )
    return _openai_primary()


def ScoutBrowserFallbackLLM(*, temperature: float = 0) -> ChatOpenAI | None:
    """
    Step-level fallback LLM for browser-use failures the primary could not
    recover from (API errors, session loss, repeated strict-decode failures
    that exhausted the recovery ladder). Full-tier model with browser-use's
    default GPT-5 reasoning handling (temperature stripped, reasoning_effort
    sent). Runs the same repair/retry ladder as the primary: on 2026-07-10 a
    PLAIN ChatOpenAI here failed the identical trailing-characters parse the
    primary just failed, making the fallback useless exactly when it fired.
    None when OPENAI_API_KEY is absent (the Agent then runs without a
    step-level fallback).
    """
    _ = temperature  # GPT-5 full tier does not accept temperature
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    return _RobustChatOpenAI(
        model=BROWSER_AGENT_FALLBACK_MODEL,
        api_key=api_key,
    )
