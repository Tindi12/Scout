"""
Scout's job-application engine: browser-use driving a Browserbase SESSION.

This is the uncapped engine — sessions are metered by browser-minutes, not the
15-runs/period hosted-Agents quota that killed the browserbase_agent.py path for
Scout's volume (services/browserbase_agent.py remains as the SCOUT_APPLY_ENGINE
fallback). Scout owns the agent loop, the LLM (ChatBrowserUse gateway by default —
see services/browser_llm.py), and the session, so Stop-All is a real in-process
agent.stop() and the residential proxy can be geo-targeted to the applicant.

apply() is a synchronous façade returning the same dict contract as the hosted
engine: {success, error_code?, error?, needs_attention, attention_question?}.
"""
import asyncio
import base64
import logging
import os
import random
import re
import shutil
import tempfile
import time
from urllib.parse import urlparse

from dotenv import load_dotenv

from pydantic import BaseModel

from browser_use import Agent, Browser, BrowserProfile
from browser_use.agent.views import ActionResult, AgentHistoryList
from browser_use.tools.service import Tools
from services.browser_llm import ScoutBrowserFallbackLLM, ScoutBrowserLLM
from services.notification_helpers import notify_application_by_id

from core.browserbase import (
    create_session as create_browserbase_session,
    release_session as release_browserbase_session,
)
from core.redis_client import (
    CONTROL_TOKEN_TTL,
    GATE_FLAG_TTL,
    cancel_key,
    cancelled_token_key,
    gate_key,
    get_redis,
    verification_code_key,
)
from core.supabase_client import supabase

logger = logging.getLogger(__name__)
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
BROWSERBASE_API_KEY = os.getenv("BROWSERBASE_API_KEY")
BROWSERBASE_PROJECT_ID = os.getenv("BROWSERBASE_PROJECT_ID")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY must be set for browser agent")
if not BROWSERBASE_API_KEY:
    raise RuntimeError("BROWSERBASE_API_KEY not set")
if not BROWSERBASE_PROJECT_ID:
    raise RuntimeError("BROWSERBASE_PROJECT_ID not set")


_UPLOAD_STALE_NODE_TOKENS = (
    "no node found for given backend id",
    "setfileinputfiles",
    "uploadfileevent",
)
_UPLOAD_FAILURE_TOKENS = (
    "failed to upload file",
    "action 'upload_file' failed",
    "upload failed",
    "file input",
)
_SESSION_LOSS_TOKENS = (
    "websocket connection closed",
    "http 410",
    "reconnection failed",
    "cdp still not connected",
    "expected at least one handler to return a non-none result",
    "browserstaterequestevent",
    "cannot navigate - browser not connected",
    "session with given id not found",
    "tabclosedevent",
    "failed to open a new tab",
    "no valid agent focus available",
    # CDP-level degradation: remote Chrome internal errors / DOM build timeouts.
    # These show up when a long-lived Browserbase session starts to rot.
    "-32603",
    "capturescreenshot",
    "ax_tree",
    "build dom tree",
    "cdp requests failed or timed out",
)
_STALE_CLICK_TOKENS = (
    "index may be stale",
    "element may not be interactable or visible",
    "failed to click element",
    "get fresh browser state before retrying",
)
_PHASE_WATCHDOG_TOKENS = (
    "expected at least one handler to return a non-none result",
    "browserstaterequestevent",
)
_TYPE_TIMEOUT_TOKENS = (
    "typetextevent",
    "timed out after 60.0s",
    "failed to dispatch typetextevent",
)
_PHASE_MAX_SESSION_RESTARTS = 1
_PHASE_MAX_STALE_CLICK_RETRIES = 1
_PHASE_MAX_TYPE_TIMEOUT_RETRIES = 1
# Free-text answers longer than this are entered by setting the element value via a
# single JavaScript assignment instead of dispatching one key event per character.
# Char-by-char typing over a remote Browserbase CDP link costs ~150ms/char (a 600-char
# essay is 90s+) and wedges browser-use's event bus mid-type. Short fields (names,
# emails, and city autocompletes that need real keystrokes to fire suggestions) stay
# on the normal typing path, so this threshold must sit above any such short value.
_LONG_TEXT_THRESHOLD = 100

# Humanized typing: enter long free-text as a series of TRUSTED word chunks (one CDP
# Input.insertText per word) spread over a few seconds, instead of one instantaneous
# insert. A 263-char essay materializing in 0ms is itself a bot tell even when the
# events are trusted — Ashby's manual-vs-agent split (a human submitting the SAME
# posting succeeded) points at automation telemetry like fill cadence. Word-CHUNK
# insertText (NOT char-by-char key events) is the safe middle: it gives human-like
# pacing and progressive input events while making only ~one CDP call per word, so it
# avoids the remote-CDP event-bus deadlock that the slow per-character type path hit
# (the original reason the JS value-set bypass exists). Toggle off to A/B:
# SCOUT_HUMANIZED_TYPING=false.
_HUMANIZED_TYPING = os.getenv("SCOUT_HUMANIZED_TYPING", "true").strip().lower() in {
    "1", "true", "yes", "on",
}
# Randomized delay (seconds) between word chunks — ~45-word essay lands in ~3-8s.
_HUMAN_WORD_DELAY = (0.06, 0.18)

# A consolidated run does fill + upload + submit in one continuous agent.
# Bound it by both a step budget and a hard wall-clock cap that sits comfortably
# below the Celery soft_time_limit (900s), so the agent always yields a clean
# result before Celery can SIGKILL it mid-action. The budget ladder must hold:
# _AGENT_RUN_TIMEOUT < APPLY_PIPELINE_TIMEOUT (job_tasks) < Celery soft < hard
# < Browserbase session timeout (core/browserbase). 840s covers a full multi-field
# form + upload + submit (a clean Greenhouse run is ~25-35 steps) PLUS up to ~6
# minutes of request_verification_code waiting for the user to paste an emailed
# ATS code into the tracker.
# 40 steps (down from 55): the gateway model wastes fewer steps than gpt-5.4-mini
# did, and a run that needs more than 40 is thrashing — fast-fail into the retry
# ladder instead of burning the wall clock.
_AGENT_MAX_STEPS = int(os.getenv("SCOUT_AGENT_MAX_STEPS", "40"))
_AGENT_RUN_TIMEOUT = 840  # seconds — hard cap on a single agent.run()
# flash_mode strips the thinking/evaluation fields from every step's LLM output —
# output tokens are the latency-dominant cost of a step. Toggle off to A/B if form
# accuracy regresses: SCOUT_BROWSER_FLASH_MODE=false.
_FLASH_MODE = os.getenv("SCOUT_BROWSER_FLASH_MODE", "true").strip().lower() in {
    "1", "true", "yes", "on",
}
_AGENT_STEP_TIMEOUT = 150  # seconds — per-step cap so a stuck step fails fast
# Verification-code relay: one tool call polls Redis for this long (kept under
# _AGENT_STEP_TIMEOUT so the step never times out), checking every few seconds.
# The prompt allows up to 3 calls, giving the user ~6 minutes total to respond.
_VERIFICATION_POLL_TIMEOUT = 120  # seconds per request_verification_code call
_VERIFICATION_POLL_INTERVAL = 3  # seconds between Redis checks
_VERIFICATION_MAX_CALLS = 3
# Composio auto-fetch: how long after the gate is hit the deterministic Gmail fetch
# keeps being attempted, and the cadence between attempts. Must match
# routes/apply_code.py's WAIT->TIMEOUT window (same env var) so auto and manual
# paths give up together.
_VERIFY_WINDOW = int(os.getenv("APPLY_VERIFY_TIMEOUT", "300"))
_FETCH_INTERVAL = 15.0
# Stop-all kill switch: a watcher polls the per-application Redis cancel flag this
# often during agent.run() and calls agent.stop() when it appears, so Stop All
# aborts a LIVE browser run within seconds instead of only blocking queued tasks.
_CANCEL_POLL_INTERVAL = 3  # seconds


class ApplyCancelled(Exception):
    """User hit Stop All — the in-flight agent run was aborted cooperatively."""
# Consecutive-failure budget. Lowered from the browser-use default (5) so a crashed
# Browserbase tab (repeated CDP -32603 / state-build timeouts) aborts the run in ~2 min
# and converts to a clean browser_session_lost retry, instead of spamming for 3+ min.
# Safe to lower because the upload no longer needs retries (path is auto-resolved).
_AGENT_MAX_FAILURES = 4
# Cap on `browser.kill()` during session release. On a wedged tab, kill() awaits CDP
# work that never completes — unbounded it hung the worker for ~7 minutes once. The
# Browserbase REST release has already run by the time kill() is awaited, so a timeout
# here loses nothing.
_BROWSER_KILL_TIMEOUT = 10
# The ATS records the basename of the injected resume as the filename. apply() writes
# the temp file under a personalized name (resume_filename() below — e.g.
# "Rabuor_Tindi_Resume.pdf"), so the basename is always presentable; a
# generic/random name is a bot tell for spam scoring.


class BrowserPhaseTimeout(Exception):
    """Raised when an agent run exceeds its hard wall-clock budget (likely a CDP stall)."""


# React/Vue/Angular-safe value injection. We use the prototype's NATIVE value setter so
# the framework's change tracking fires, then dispatch input+change. Picks the correct
# prototype for <textarea> vs <input> — browser-use's own _set_value_directly hardcodes
# HTMLInputElement.prototype and silently no-ops on textareas, which is exactly where the
# long essay answers live. `text` is passed as a call argument (not interpolated into the
# source) so quotes/newlines in answers can't break the script.
_JS_SET_VALUE = """
function(text) {
    const tag = (this.tagName || '').toLowerCase();
    const proto = tag === 'textarea'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    try { this.focus(); } catch (e) {}
    setter.call(this, text);
    this.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    this.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    return this.value;
}
"""


async def _set_long_text_via_js(browser_session, index: int, text: str):
    """
    Enter a long text value with a single CDP JS value assignment.

    Returns an ActionResult on success, or None if the caller should fall back to
    character typing (element not found, not an <input>/<textarea>, or the value
    didn't take — e.g. a masked/managed field or a contenteditable rich-text editor).
    """
    node = await browser_session.get_dom_element_by_index(index)
    if node is None or node.tag_name not in ("input", "textarea"):
        return None
    cdp_session = await browser_session.cdp_client_for_node(node)
    try:
        await cdp_session.cdp_client.send.DOM.scrollIntoViewIfNeeded(
            params={"backendNodeId": node.backend_node_id},
            session_id=cdp_session.session_id,
        )
    except Exception:
        pass  # node may still be settable even if scroll fails
    resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
        params={"backendNodeId": node.backend_node_id},
        session_id=cdp_session.session_id,
    )
    object_id = (resolved.get("object") or {}).get("objectId")
    if not object_id:
        return None
    result = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
        params={
            "objectId": object_id,
            "functionDeclaration": _JS_SET_VALUE,
            "arguments": [{"value": text}],
            "returnByValue": True,
        },
        session_id=cdp_session.session_id,
    )
    actual = (result.get("result") or {}).get("value")
    if not isinstance(actual, str) or text not in actual:
        return None  # value didn't stick — let the caller type it instead
    msg = f"Entered {len(text)} characters into element {index} (direct value set)."
    return ActionResult(extracted_content=msg, long_term_memory=msg)


async def _set_long_text_trusted(browser_session, index: int, text: str):
    """
    Enter a long text value via CDP Input.insertText, so the resulting input/change
    events fire with isTrusted=true (a real paste/keystroke). The _set_long_text_via_js
    fallback dispatches synthetic events whose isTrusted=false is a known automation
    tell to bot/spam detectors (browser-use issue #3829, closed "not planned" — so we
    handle it). With _HUMANIZED_TYPING on (default), the text goes in as timed word
    chunks (one insertText per word) so it doesn't materialize instantly — itself a bot
    tell; off, it's a single one-shot insert. Either way: no slow char-by-char key
    typing, which is what deadlocked the remote CDP event bus.

    Returns an ActionResult on success, or None so the caller falls back to
    _set_long_text_via_js when: the element isn't a plain <input>/<textarea>; it
    already holds text (insertText inserts at the caret and would APPEND, not replace,
    so we only take this path on an empty field); or the value didn't stick.
    """
    node = await browser_session.get_dom_element_by_index(index)
    if node is None or node.tag_name not in ("input", "textarea"):
        return None
    cdp_session = await browser_session.cdp_client_for_node(node)
    try:
        await cdp_session.cdp_client.send.DOM.scrollIntoViewIfNeeded(
            params={"backendNodeId": node.backend_node_id},
            session_id=cdp_session.session_id,
        )
    except Exception:
        pass  # node may still be settable even if scroll fails
    resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
        params={"backendNodeId": node.backend_node_id},
        session_id=cdp_session.session_id,
    )
    object_id = (resolved.get("object") or {}).get("objectId")
    if not object_id:
        return None

    async def _read_value():
        res = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
            params={
                "objectId": object_id,
                "functionDeclaration": "function() { return this.value; }",
                "returnByValue": True,
            },
            session_id=cdp_session.session_id,
        )
        return (res.get("result") or {}).get("value")

    # insertText inserts at the caret without clearing — only safe on an empty field.
    current = await _read_value()
    if isinstance(current, str) and current.strip():
        return None

    await cdp_session.cdp_client.send.DOM.focus(
        params={"backendNodeId": node.backend_node_id},
        session_id=cdp_session.session_id,
    )
    if _HUMANIZED_TYPING:
        # One trusted insertText per word, with human-like pauses between words. Each
        # token keeps its trailing whitespace so the reconstructed text is exact.
        for token in re.findall(r"\S+\s*", text):
            await cdp_session.cdp_client.send.Input.insertText(
                params={"text": token},
                session_id=cdp_session.session_id,
            )
            await asyncio.sleep(random.uniform(*_HUMAN_WORD_DELAY))
        how = "humanized trusted typing"
    else:
        await cdp_session.cdp_client.send.Input.insertText(
            params={"text": text},
            session_id=cdp_session.session_id,
        )
        how = "trusted insert"
    actual = await _read_value()
    if not isinstance(actual, str) or text not in actual:
        return None  # didn't stick — let the JS value-setter try
    msg = f"Entered {len(text)} characters into element {index} ({how})."
    return ActionResult(extracted_content=msg, long_term_memory=msg)


# Seconds to wait after typing before the autocomplete dropdown is expected to render.
_AUTOCOMPLETE_RENDER_WAIT = 1.3

# Click the first visible suggestion in a location/typeahead dropdown, IN-PAGE, before
# control returns to the agent loop. This is the whole fix for Lever's location field:
# its Google-Places input CLEARS itself on blur unless a suggestion is committed, and a
# 1-action-per-step agent always blurs it between steps. We commit the selection with a
# real mousedown (fires before blur) + mouseup + click so the field keeps the value.
# Selectors cover the common typeahead implementations; first match wins.
_JS_CLICK_FIRST_SUGGESTION = """
(() => {
    const selectors = [
        '.pac-item',
        '[role="option"]',
        'ul[role="listbox"] li',
        '.dropdown-results li',
        '.location-results li',
        '.autocomplete-results li',
        '.tt-suggestion',
        '.aa-suggestion',
        '.geosuggest__item',
    ];
    const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel)).filter(isVisible);
        if (els.length) {
            const el = els[0];
            el.scrollIntoView({ block: 'center' });
            const opts = { bubbles: true, cancelable: true, view: window };
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
            return (el.textContent || '').trim().slice(0, 80);
        }
    }
    return null;
})()
"""


def _is_autocomplete_location(node) -> bool:
    """Heuristic: is this text input a location/city typeahead that needs a suggestion picked?"""
    if node is None:
        return False
    attrs = node.attributes or {}
    idv = (attrs.get("id") or "").lower()
    namev = (attrs.get("name") or "").lower()
    if "location" in idv or "location" in namev or namev in ("city", "current_location"):
        return True
    if attrs.get("aria-autocomplete") in ("list", "both"):
        return True
    if attrs.get("role") == "combobox":
        return True
    return False


async def _fill_autocomplete_location(browser_session, node, original_fn, type_kwargs):
    """
    Type a city into an autocomplete field, then commit the first dropdown suggestion
    in one atomic action so the field can't clear-on-blur before a suggestion is picked.

    Returns an ActionResult. Falls back to the plain type result if no suggestion appears
    (e.g. the field is actually plain text, or the dropdown didn't load) — the prompt then
    tells the agent to skip it if it isn't required, instead of looping.
    """
    type_result = await original_fn(**type_kwargs)
    await asyncio.sleep(_AUTOCOMPLETE_RENDER_WAIT)
    try:
        cdp_session = await browser_session.cdp_client_for_node(node)
        res = await cdp_session.cdp_client.send.Runtime.evaluate(
            params={"expression": _JS_CLICK_FIRST_SUGGESTION, "returnByValue": True},
            session_id=cdp_session.session_id,
        )
        picked = (res.get("result") or {}).get("value")
    except Exception as exc:
        logger.warning("Location autocomplete selection failed (%s); leaving typed value.", exc)
        picked = None
    if picked:
        msg = f"Selected location suggestion '{picked}'."
        return ActionResult(extracted_content=msg, long_term_memory=msg)
    return type_result


def _build_apply_tools(
    application_id: str | None = None,
    *,
    control_token: str | None = None,
    on_gate=None,
    fetch_code=None,
    on_code=None,
) -> Tools:
    """
    Build a browser-use Tools registry with two hardened overrides and two additions:

    - `input` enters long free-text answers (essays/cover letters) with ONE JS value
      assignment instead of char-by-char CDP typing, which is slow over a remote link
      and deadlocks browser-use's event bus mid-type. Short values (incl. autocomplete
      fields, which need real keystrokes) keep the built-in typing path.
    - `upload_file` is replaced with a remote-safe implementation that injects the
      file's bytes in-page instead of sending a local path over CDP
      (see _install_robust_upload / _attach_resume_bytes).
    - `request_verification_code` relays an emailed ATS code mid-run — Composio
      auto-fetch via the task's fetch_code callback, manual paste via the same Redis
      mailbox (see _install_verification_relay).
    - `pre_submit_check` is the Stop-All submit-boundary control (see
      _install_pre_submit_check); registered only when there is a token/app to check.
    """
    tools = Tools()
    registry = tools.registry.registry
    original = registry.actions.get("input")
    if original is None:
        return tools
    original_fn = original.function
    param_model = original.param_model
    description = original.description

    @tools.registry.action(description, param_model=param_model)
    async def input(  # noqa: A001 - must match the built-in action name being overridden
        params,
        browser_session,
        has_sensitive_data: bool = False,
        sensitive_data=None,
    ):
        type_kwargs = dict(
            params=params,
            browser_session=browser_session,
            has_sensitive_data=has_sensitive_data,
            sensitive_data=sensitive_data,
        )

        async def _type():
            return await original_fn(**type_kwargs)

        text = params.text or ""
        index = getattr(params, "index", None)
        if has_sensitive_data or index is None or not text:
            return await _type()

        node = None
        try:
            node = await browser_session.get_dom_element_by_index(index)
        except Exception:
            node = None

        # Autocomplete location/city field: type + commit the first suggestion atomically,
        # because these clear on blur if no suggestion is picked (the Lever location trap).
        if node is not None and _is_autocomplete_location(node):
            try:
                return await _fill_autocomplete_location(
                    browser_session, node, original_fn, type_kwargs
                )
            except Exception as exc:
                logger.warning(
                    "Autocomplete location fill failed for index %s (%s); typing instead.",
                    index,
                    exc,
                )
                return await _type()

        # Long free-text: trusted CDP insert first (isTrusted=true), then the synthetic
        # JS value-setter, then plain char typing. The first two avoid the slow/
        # deadlock-prone char-by-char CDP typing; the trusted path also avoids the
        # isTrusted=false automation tell. Each falls through to the next on failure.
        if len(text) > _LONG_TEXT_THRESHOLD:
            for setter in (_set_long_text_trusted, _set_long_text_via_js):
                try:
                    injected = await setter(browser_session, index, text)
                except Exception as exc:
                    logger.warning(
                        "%s failed for index %s (%s); trying next text-entry method.",
                        setter.__name__,
                        index,
                        exc,
                    )
                    injected = None
                if injected is not None:
                    return injected

        return await _type()

    _install_robust_upload(tools)
    _install_verification_relay(
        tools, application_id, on_gate=on_gate, fetch_code=fetch_code, on_code=on_code
    )
    if application_id or control_token:
        _install_pre_submit_check(tools, application_id, control_token)
    return tools


class _RequestCodeAction(BaseModel):
    """Params for request_verification_code — both optional, used for the user-facing message."""

    sent_to: str | None = None  # email address the page says the code went to
    code_length: int | None = None  # number of characters/boxes the page expects


def _install_verification_relay(
    tools: Tools,
    application_id: str | None,
    *,
    on_gate=None,
    fetch_code=None,
    on_code=None,
) -> None:
    """
    Register `request_verification_code`: the mid-run emailed-code relay.

    ATSs (Greenhouse's "confirm you're human" wall) email the applicant a code at
    submit time. This tool preserves the Composio poll-gate contract of
    routes/apply_code.py exactly, minus the HTTP hop and tab juggling:

    - The FIRST call stamps apply:gate:{app_id} (SET NX — the same key the
      /apply-code route writes), then fires on_gate(gate_ts) — the task's status
      flip to awaiting_code + notification (Composio-aware message). The tracker's
      CODE NEEDED card and the manual paste path light up identically.
    - The poll loop then interleaves deterministic fetch_code(gate_ts) attempts
      (Composio Gmail read, every ~15s inside the APPLY_VERIFY_TIMEOUT window) with
      3s polls of the Redis mailbox apply:code:{app_id} — the manual CodeModal
      writes that same mailbox, so auto and manual converge. on_code(code) reflects
      an auto-fetched code in the tracker.
    - Without callbacks (legacy caller), it degrades to the manual-only relay with
      its own status flip + notification.

    The code is consumed on read and never persisted. One call waits ~2 minutes; the
    prompt allows up to 3 calls before the agent gives up and reports the timeout.
    """
    call_count = {"n": 0}
    state: dict = {"gate_ts": None, "last_fetch": 0.0}

    verification_desc = (
        "Request an emailed verification/security code from the user. Use ONLY when "
        "the page says a code was emailed to the applicant (e.g. 'enter the code sent "
        "to your email to confirm you are human'). Optionally pass sent_to (the email "
        "address shown) and code_length (number of characters expected). Notifies the "
        "user in Scout and waits up to 2 minutes for them to paste the code; returns "
        f"the code if provided. May be called up to {_VERIFICATION_MAX_CALLS} times "
        "total to keep waiting."
    )

    @tools.registry.action(verification_desc, param_model=_RequestCodeAction)
    async def request_verification_code(params):
        if not application_id:
            return ActionResult(
                error=(
                    "Verification-code relay is unavailable for this run. Call done and "
                    "report that an emailed verification code blocked submission."
                )
            )
        call_count["n"] += 1
        attempt = call_count["n"]
        if attempt > _VERIFICATION_MAX_CALLS:
            return ActionResult(
                error=(
                    "Verification-code wait budget exhausted. Call done now and report "
                    "that the emailed verification code was not provided in time."
                )
            )

        redis_client = get_redis()

        # First call = the gate signal. SET NX with the same key/shape the
        # /apply-code route writes, so every observer of the gate (tracker,
        # hosted-engine worker loop) sees one consistent marker.
        if state["gate_ts"] is None:
            now = int(time.time())
            state["gate_ts"] = float(now)
            try:
                if not await asyncio.to_thread(
                    redis_client.set,
                    gate_key(application_id),
                    str(now),
                    nx=True,
                    ex=GATE_FLAG_TTL,
                ):
                    raw = await asyncio.to_thread(redis_client.get, gate_key(application_id))
                    if raw:
                        state["gate_ts"] = float(raw)
            except Exception:
                pass  # gate marker is observability; the relay still works without it

            where = f" to {params.sent_to}" if params.sent_to else ""
            length = f"{params.code_length}-character " if params.code_length else ""
            message = (
                f"The job site emailed a {length}verification code{where}. "
                "Paste it into Scout's CODE NEEDED prompt within the next few minutes "
                "so the application can be submitted."
            )

            def _mark_awaiting():
                if on_gate:
                    on_gate(state["gate_ts"])
                    return
                supabase.table("applications").update(
                    {"status": "awaiting_code", "error_message": message}
                ).eq("id", application_id).execute()
                notify_application_by_id(
                    application_id,
                    "application_awaiting_code",
                    body_override=message,
                )

            try:
                await asyncio.to_thread(_mark_awaiting)
            except Exception:
                logger.warning("awaiting-code gate callback failed", exc_info=True)

        logger.info(
            "Awaiting verification code for application %s (attempt %s/%s)",
            application_id, attempt, _VERIFICATION_MAX_CALLS,
        )

        key = verification_code_key(application_id)
        stop_key = cancel_key(application_id)
        deadline = asyncio.get_event_loop().time() + _VERIFICATION_POLL_TIMEOUT
        code: str | None = None
        code_was_auto = False
        while asyncio.get_event_loop().time() < deadline:
            value = await asyncio.to_thread(redis_client.get, key)
            if value and str(value).strip():
                code = str(value).strip()
                await asyncio.to_thread(redis_client.delete, key)
                break
            # Honor Stop All promptly even while parked waiting for a code — the
            # run-level watcher has already called agent.stop(); ending this action
            # lets the run loop exit at the step boundary instead of waiting out
            # the full poll window.
            try:
                if await asyncio.to_thread(redis_client.get, stop_key):
                    return ActionResult(
                        error="Application stopped by the user. Call done immediately reporting the cancellation."
                    )
            except Exception:
                pass
            # Composio auto-fetch: one deterministic Gmail read attempt every ~15s
            # while inside the verify window. A fetched code is used directly (no
            # mailbox round-trip); the manual paste path stays live in parallel.
            if (
                fetch_code
                and time.time() - state["gate_ts"] <= _VERIFY_WINDOW
                and time.monotonic() - state["last_fetch"] >= _FETCH_INTERVAL
            ):
                state["last_fetch"] = time.monotonic()
                try:
                    fetched = await asyncio.to_thread(fetch_code, state["gate_ts"])
                except Exception:
                    logger.warning("fetch_code failed", exc_info=True)
                    fetched = None
                if fetched and str(fetched).strip():
                    code = str(fetched).strip()
                    code_was_auto = True
                    break
            await asyncio.sleep(_VERIFICATION_POLL_INTERVAL)

        if code:
            def _mark_resumed():
                if code_was_auto and on_code:
                    on_code(code)
                    return
                supabase.table("applications").update(
                    {"status": "in_progress", "error_message": None}
                ).eq("id", application_id).execute()

            try:
                await asyncio.to_thread(_mark_resumed)
            except Exception:
                logger.warning("code-resumed callback failed", exc_info=True)
            logger.info("Verification code received for application %s", application_id)
            msg = (
                f"Verification code received: {code} — click the FIRST code input box, "
                "then type the entire code in one input action (the boxes auto-advance). "
                "Then continue the submission."
            )
            return ActionResult(extracted_content=msg, long_term_memory=msg)

        if attempt >= _VERIFICATION_MAX_CALLS:
            return ActionResult(
                extracted_content=(
                    "No code was provided after the final wait. Call done now and report "
                    "that the emailed verification code was not provided in time."
                )
            )
        return ActionResult(
            extracted_content=(
                f"No code yet (attempt {attempt} of {_VERIFICATION_MAX_CALLS}). The user "
                "has been notified in the Scout tracker. Call request_verification_code "
                "again to keep waiting."
            )
        )


class _PreSubmitCheckAction(BaseModel):
    """No params — the control token / application id are bound at registration."""


def _install_pre_submit_check(
    tools: Tools, application_id: str | None, control_token: str | None
) -> None:
    """
    Register `pre_submit_check`: the Stop-All submit-boundary control.

    Mirrors routes/apply_code.py's /apply-control semantics (same Redis keys) without
    the HTTP hop or tab juggling: CANCEL when this attempt's control token was
    cancelled (an abandoned deadline attempt must not double-submit alongside its
    retry) or the application's stop-all flag is set; OK otherwise. Fail-OPEN on any
    Redis error — an availability blip must not block every submit; only an explicit
    CANCEL means stop. agent.stop() is the primary in-process cancel; this closes the
    race where a stop lands between the last step check and the Submit click.
    """
    desc = (
        "Check whether this application is still authorized to be submitted. Call "
        "this exactly once, immediately before clicking the final Submit/Apply "
        "button. If it returns CANCEL, do not submit."
    )

    @tools.registry.action(desc, param_model=_PreSubmitCheckAction)
    async def pre_submit_check(params):
        _ = params

        def _is_cancelled() -> bool:
            r = get_redis()
            if control_token and r.get(cancelled_token_key(control_token)):
                return True
            if application_id and r.get(cancel_key(application_id)):
                return True
            return False

        try:
            cancelled = await asyncio.to_thread(_is_cancelled)
        except Exception:
            cancelled = False  # fail-open by design
        if cancelled:
            logger.info(
                "pre_submit_check: CANCEL for application %s — submit blocked.",
                application_id,
            )
            return ActionResult(
                error=(
                    "CANCEL — the user stopped this application. Do NOT submit. "
                    "Call done now reporting the application was cancelled "
                    "(include the word 'cancelled')."
                )
            )
        msg = "OK — proceed with the final submit."
        return ActionResult(extracted_content=msg, long_term_memory=msg)


class _UploadResumeAction(BaseModel):
    """Upload params with an OPTIONAL index so a path-only call is not schema-rejected."""

    path: str
    index: int | None = None


# Attach a file to an <input type=file> entirely in-page. `this` is the input element;
# the bytes arrive as base64 (call argument, never interpolated into source). A real
# File set through DataTransfer + input/change events is what react-dropzone-style ATS
# widgets listen for, and it works on hidden inputs without any clicking.
_JS_ATTACH_FILE = """
function(b64, name, mime) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type: mime }));
    this.files = dt.files;
    this.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    this.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    const f = this.files && this.files[0];
    return { count: this.files ? this.files.length : 0, name: f ? f.name : '', size: f ? f.size : 0 };
}
"""


async def _attach_resume_bytes(browser_session, node, path: str) -> ActionResult:
    """
    Attach the resume to a file input by injecting its BYTES in-page.

    Never hand CDP a file path: DOM.setFileInputFiles resolves paths on the machine
    running Chrome, and with a remote Browserbase browser the worker's local temp
    path doesn't exist there. Chrome accepts it anyway ("Successfully uploaded" false
    positive), the ATS JS then reads a phantom File, its S3 upload dies ('Failed to
    fetch') and the pending blob read wedges the tab's CDP target — the 2026-06-11
    Ashby failure. Base64-ing the bytes across CDP and rebuilding a real File in the
    page sidesteps the filesystem entirely.

    Verifies in-page that the input holds exactly one file of the expected size, so
    "attached" can never be a false positive again.
    """
    with open(path, "rb") as fh:
        data = fh.read()
    if not data:
        return ActionResult(error=f"Resume file {path} is empty (0 bytes); nothing to upload.")
    mime = "application/pdf" if path.lower().endswith(".pdf") else "application/octet-stream"

    cdp_session = await browser_session.cdp_client_for_node(node)
    resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
        params={"backendNodeId": node.backend_node_id},
        session_id=cdp_session.session_id,
    )
    object_id = (resolved.get("object") or {}).get("objectId")
    if not object_id:
        return ActionResult(
            error="Could not resolve the file input element; refresh page state and retry the upload once."
        )
    result = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
        params={
            "objectId": object_id,
            "functionDeclaration": _JS_ATTACH_FILE,
            "arguments": [
                {"value": base64.b64encode(data).decode("ascii")},
                {"value": os.path.basename(path)},
                {"value": mime},
            ],
            "returnByValue": True,
        },
        session_id=cdp_session.session_id,
    )
    attached = (result.get("result") or {}).get("value") or {}
    if attached.get("count") == 1 and attached.get("size") == len(data):
        msg = (
            f"Attached resume as '{attached.get('name')}' ({attached.get('size')} bytes). "
            f"The form should now show '{attached.get('name')}' — verify it does before submitting."
        )
        return ActionResult(extracted_content=msg, long_term_memory=msg)
    return ActionResult(
        error=f"Resume upload failed: file injection did not stick (input reports {attached})."
    )


async def _count_attached_files(browser_session, node) -> int | None:
    """Number of files a file input currently holds, or None if unreadable."""
    try:
        cdp_session = await browser_session.cdp_client_for_node(node)
        resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
            params={"backendNodeId": node.backend_node_id},
            session_id=cdp_session.session_id,
        )
        object_id = (resolved.get("object") or {}).get("objectId")
        if not object_id:
            return None
        result = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
            params={
                "objectId": object_id,
                "functionDeclaration": "function() { return this.files ? this.files.length : 0; }",
                "returnByValue": True,
            },
            session_id=cdp_session.session_id,
        )
        value = (result.get("result") or {}).get("value")
        return value if isinstance(value, int) else None
    except Exception:
        return None


def _resolve_upload_path(requested: str, available: list[str]) -> str:
    """
    Map the model's requested upload path to a real available file.

    Single-file forms keep the old leniency (use the one available file). With two
    files available (resume + cover letter), the model is told both exact paths, but
    can still mis-transcribe — so match by basename, then by a 'cover'/'resume' token
    hint, before falling back to the first available file (the resume).
    """
    if not available:
        return requested
    if requested in available:
        return requested
    if len(available) == 1:
        return available[0]

    req = (requested or "").lower()
    req_base = os.path.basename(req)
    for p in available:
        if os.path.basename(p).lower() == req_base:
            return p
    for token in ("cover", "resume"):
        if token in req:
            for p in available:
                if token in os.path.basename(p).lower():
                    return p
    return available[0]


def _install_robust_upload(tools: Tools) -> None:
    """
    Replace `upload_file` with a remote-safe, byte-injecting implementation.

    Two failure modes of the built-in are closed here:
    - Schema fumbles: browser-use ships `upload_file` with an empty description and a
      REQUIRED `index`, so a weaker model emits `{path}` with no index (schema-rejected)
      or types the path into a text field. Our param model makes `index` optional and
      the file input is auto-detected when it's omitted or wrong.
    - Remote-path poison: the built-in forwards the LOCAL worker path to CDP
      DOM.setFileInputFiles on the REMOTE browser (see _attach_resume_bytes). We inject
      the file's bytes in-page instead, so no path ever crosses the wire.

    Multi-input forms (resume + cover-letter upload): auto-detection prefers the first
    EMPTY file input, so a second `upload_file` call lands on the cover-letter slot
    instead of silently re-attaching to the already-filled resume input.
    """
    upload_desc = (
        "Upload a local file (e.g. the resume) to a file input on the page. "
        "Provide 'path' (the absolute file path). 'index' is optional — if omitted, "
        "the first file input on the page that does not already hold a file is "
        "auto-detected. For a form with a second upload field (e.g. a required "
        "cover-letter upload), call this again with the 'index' of that field. "
        "Do NOT type the path into a field and do NOT click a button that opens a "
        "system file-picker dialog."
    )

    @tools.registry.action(upload_desc, param_model=_UploadResumeAction)
    async def upload_file(  # noqa: A001 - must match the built-in action name being overridden
        params,
        browser_session,
        available_file_paths,
    ):
        # Resolve the path: don't trust the model's typed path — it frequently
        # mis-transcribes the random temp filename (e.g. tmpXXXXk4w.pdf -> ...k4f.pdf).
        # Single file → use it; two files (resume + cover letter) → match by basename
        # / token hint so each upload lands the intended file.
        path = _resolve_upload_path(params.path, available_file_paths or [])

        # Resolve the ACTUAL <input type=file> node. A model-supplied index usually
        # points at the visible dropzone/button, not the (often hidden) input itself.
        try:
            selector_map = await browser_session.get_selector_map()
        except Exception:
            selector_map = {}
        file_input_node = None
        if params.index is not None and params.index in selector_map:
            try:
                # browser-use's own resolution: walks the element's children/siblings
                # for the file input the clicked-on widget wraps.
                file_input_node = browser_session.find_file_input_near_element(
                    selector_map[params.index]
                )
            except Exception:
                file_input_node = None
        if file_input_node is None:
            # Prefer the first EMPTY file input. On forms with several upload fields
            # (resume + cover letter), the resume input already holds a file by the
            # time a second upload runs, so "first empty" targets the right slot even
            # when the model omitted or fumbled the index. Fall back to the first
            # file input of any state (e.g. a retry after a failed attach).
            first_any = None
            for element in selector_map.values():
                if not browser_session.is_file_input(element):
                    continue
                if first_any is None:
                    first_any = element
                if await _count_attached_files(browser_session, element) == 0:
                    file_input_node = element
                    break
            if file_input_node is None:
                file_input_node = first_any
        if file_input_node is None:
            return ActionResult(
                error="No file input element found on the page to upload the resume to."
            )

        try:
            return await _attach_resume_bytes(browser_session, file_input_node, path)
        except Exception as exc:
            logger.warning("In-page resume injection failed: %s", exc)
            return ActionResult(
                error=f"Resume upload failed ({exc}); the resume is NOT attached. "
                "Refresh page state and retry the upload once."
            )


def resume_filename(applicant_name: str | None) -> str:
    """
    ATS-visible resume filename, personalized from the applicant's name
    ("Rabuor Tindi" -> "Rabuor_Tindi_Resume.pdf").

    The ATS records the basename of the attached file. A generic or random name
    (Resume.pdf, tmpXXXX.pdf) is both a bot tell for spam scoring and ugly for
    recruiters.
    """
    stem = re.sub(r"[^A-Za-z0-9]+", "_", applicant_name or "").strip("_")
    return f"{stem}_Resume.pdf" if stem else "Resume.pdf"


def cover_letter_filename(applicant_name: str | None) -> str:
    """
    ATS-visible cover-letter filename, personalized like resume_filename
    ("Rabuor Tindi" -> "Rabuor_Tindi_Cover_Letter.pdf"). The distinct '_Cover_Letter'
    token also lets the upload tool tell the two files apart by basename.
    """
    stem = re.sub(r"[^A-Za-z0-9]+", "_", applicant_name or "").strip("_")
    return f"{stem}_Cover_Letter.pdf" if stem else "Cover_Letter.pdf"


# US state name → USPS 2-letter code. Browserbase proxy geolocation wants the
# 2-letter code for US states; profiles store the full name ("Indiana"). DC included.
_US_STATE_CODES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}


def _country_code(raw: str | None) -> str | None:
    """
    Normalize a profile country to a 2-letter code for Browserbase geolocation.

    Empty → "US" (Scout is US-focused and the applicant-context builder defaults the
    same way). Explicit 2-letter codes pass through. Anything we can't confidently
    map returns None so the caller skips geo-targeting rather than asserting a wrong
    location (an incorrect geo would be its own mismatch signal).
    """
    v = (raw or "").strip()
    if not v:
        return "US"
    low = v.lower().replace(".", "")
    if low in {"us", "usa", "united states", "united states of america", "america"}:
        return "US"
    if len(v) == 2 and v.isalpha():
        return v.upper()
    return None


def _state_code(raw: str | None, country: str | None) -> str | None:
    """US 2-letter state code, or None. Browserbase only accepts state for US proxies."""
    if country != "US":
        return None
    v = (raw or "").strip()
    if not v:
        return None
    if len(v) == 2 and v.isalpha():
        return v.upper()
    return _US_STATE_CODES.get(v.lower())


def _build_geolocation(user_data: dict) -> dict | None:
    """
    Build a Browserbase proxy geolocation from the applicant's profile address so the
    residential exit IP matches the address on the form (Ashby flags "location
    mismatch"). Returns None — caller falls back to a plain residential proxy — when
    there's no city or the country can't be resolved, so we never assert a location
    we aren't sure of.
    """
    city = (user_data.get("address_city") or "").strip()
    if not city:
        return None
    country = _country_code(user_data.get("address_country"))
    if not country:
        return None
    geo = {"city": city, "country": country}
    state = _state_code(user_data.get("address_state"), country)
    if state:
        geo["state"] = state
    return geo


_MONTH_NAMES = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

# Profile degree_type enum → human label the agent matches against form options.
# The raw enum ("bachelors") doesn't match ATS dropdown text ("Bachelor's Degree").
_DEGREE_LABELS = {
    "associate": "Associate's Degree",
    "bachelors": "Bachelor's Degree",
    "masters": "Master's Degree",
    "phd": "Doctorate / PhD",
}


def _degree_label(degree_type: str | None) -> str:
    v = (degree_type or "").strip()
    if not v:
        return ""
    return _DEGREE_LABELS.get(v.lower(), v)


def _format_month_year(value: str | None) -> str:
    """Format a stored DATE ('2022-08-01') as 'August 2022' for form answers.

    Returns "" for empty input; returns the raw trimmed value if it isn't a
    parseable YYYY-MM(-DD) date (never raises — context building must not fail).
    """
    v = (value or "").strip()
    if not v:
        return ""
    m = re.match(r"^(\d{4})-(\d{2})(?:-\d{2})?$", v)
    if not m:
        return v
    year = m.group(1)
    month_idx = int(m.group(2))
    if 1 <= month_idx <= 12:
        return f"{_MONTH_NAMES[month_idx - 1]} {year}"
    return v


def _national_phone(phone: str) -> str:
    """
    Return the national significant number (no country code, digits only).

    intl-tel-input shows the country code (+1) outside the input box, so the
    input itself must receive only the national digits — 10 for US numbers.

    Examples:
      +15742017358  →  5742017358
      15742017358   →  5742017358
       5742017358   →  5742017358
      574-201-7358  →  5742017358
    """
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


# Profile self-ID vocabulary → answer text for EEO/diversity form questions. Keys
# mirror the profile page's select values (packages/web/app/(dashboard)/profile/
# page.tsx: GENDER_OPTIONS / RACE_OPTIONS / VETERAN_OPTIONS / DISABILITY_OPTIONS).
# A "prefer_not_to_say" profile value maps to the decline-style answer rather than
# being omitted, so the agent declines explicitly instead of improvising.
_SELF_ID_DECLINE = "Decline to self identify / I don't wish to answer"
_GENDER_ANSWERS = {
    "man": "Male / Man",
    "woman": "Female / Woman",
    "non_binary": "Non-binary",
    "self_describe": "Prefer to self-describe",
    "prefer_not_to_say": _SELF_ID_DECLINE,
}
_RACE_ANSWERS = {
    "american_indian": "American Indian or Alaska Native",
    "asian": "Asian",
    "black": "Black or African American",
    "hispanic": "Hispanic or Latino",
    "pacific_islander": "Native Hawaiian or Other Pacific Islander",
    "white": "White",
    "two_or_more": "Two or more races",
    "prefer_not_to_say": _SELF_ID_DECLINE,
}
_VETERAN_ANSWERS = {
    "not_veteran": "I am not a protected veteran",
    "veteran": "I identify as one or more of the classes of protected veteran",
    "active_duty": "Active duty service member",
    "prefer_not_to_say": _SELF_ID_DECLINE,
}
_DISABILITY_ANSWERS = {
    "no": "No, I do not have a disability and have not had one in the past",
    "yes": "Yes, I have a disability, or have had one in the past",
    "prefer_not_to_say": _SELF_ID_DECLINE,
}


def _self_identification_lines(user_data: dict) -> list[str]:
    """
    Voluntary self-ID answers from the user's profile (the Diversity section),
    mapped to the phrasing EEO dropdowns typically use. Only fields the user
    actually filled are included — the STAGE 1 prompt tells the agent to decline
    anything not listed, so an empty profile section degrades to decline-all.
    """
    def answer(field: str, mapping: dict[str, str]) -> str | None:
        raw = (user_data.get(field) or "").strip()
        if not raw:
            return None
        return mapping.get(raw, raw.replace("_", " "))

    pairs = (
        ("Gender", answer("gender_identity", _GENDER_ANSWERS)),
        ("Race / Ethnicity", answer("race_ethnicity", _RACE_ANSWERS)),
        ("Veteran status", answer("veteran_status", _VETERAN_ANSWERS)),
        ("Disability status", answer("disability_status", _DISABILITY_ANSWERS)),
    )
    lines = [f"- {label}: {value}" for label, value in pairs if value]

    # Many forms ask Hispanic/Latino as its own yes/no question, separate from race.
    race = (user_data.get("race_ethnicity") or "").strip()
    if race and race != "prefer_not_to_say":
        lines.append(f"- Hispanic or Latino: {'Yes' if race == 'hispanic' else 'No'}")

    if lines:
        lines.insert(
            0,
            "Voluntary self-identification answers (match each to the closest option on the form):",
        )
    return lines


def resolve_apply_company(*, job_url: str | None, job_company: str | None) -> str:
    """
    Resolve employer display name for answers_library placeholders.

    Prefer jobs.company from Supabase; fall back to Greenhouse board slug in the URL.
    """
    company = (job_company or "").strip()
    if company:
        return company
    if not job_url:
        return "the company"
    parsed = urlparse(job_url)
    host = (parsed.netloc or "").lower()
    path_parts = [part for part in parsed.path.split("/") if part]
    if "greenhouse.io" in host and path_parts:
        slug = path_parts[0]
        if slug not in {"jobs", "embed"} and not slug.isdigit():
            return slug.replace("-", " ").title()
    if parsed.netloc:
        return parsed.netloc.split(".")[0].replace("-", " ").title()
    return "the company"


def _substitute_answer_placeholders(text: str, user_data: dict) -> str:
    """Replace {company} / {role} in canned answers before sending to the browser agent."""
    company = (user_data.get("company") or "the company").strip() or "the company"
    role = (
        user_data.get("job_title")
        or user_data.get("role")
        or "this role"
    ).strip() or "this role"
    return text.replace("{company}", company).replace("{role}", role)


def _collect_errors(result: AgentHistoryList) -> list[str]:
    return [error for error in result.errors() if error]


def _is_stale_upload_failure(errors: list[str]) -> bool:
    if not errors:
        return False
    combined = " ".join(errors).lower()
    if not any(token in combined for token in _UPLOAD_FAILURE_TOKENS):
        return False
    return any(token in combined for token in _UPLOAD_STALE_NODE_TOKENS)


def _is_any_upload_failure(errors: list[str]) -> bool:
    if not errors:
        return False
    combined = " ".join(errors).lower()
    return any(token in combined for token in _UPLOAD_FAILURE_TOKENS)


def _is_stale_click_failure(errors: list[str]) -> bool:
    if not errors:
        return False
    combined = " ".join(errors).lower()
    return all(
        token in combined
        for token in ("failed to click element", "stale")
    ) or (
        "failed to click element" in combined
        and any(token in combined for token in _STALE_CLICK_TOKENS)
    )


def _phase_watchdog_triggered(errors: list[str]) -> bool:
    if not errors:
        return False
    combined = " ".join(errors).lower()
    return any(token in combined for token in _PHASE_WATCHDOG_TOKENS)


def _is_type_timeout_failure(errors: list[str]) -> bool:
    if not errors:
        return False
    combined = " ".join(errors).lower()
    return any(token in combined for token in _TYPE_TIMEOUT_TOKENS)


def _session_loss_reason(result: AgentHistoryList) -> str | None:
    """
    Return a human-readable reason if this phase indicates browser session loss.

    We treat empty phase history as terminal for browser-use phase orchestration,
    because follow-up phases cannot recover state.
    """
    if len(result) == 0:
        return "Browser phase returned no actions/results (empty state)."
    errors = _collect_errors(result)
    if not errors:
        # A wedged tab makes every state fetch fail with EMPTY error strings
        # ("Result failed 1/5 times: " — nothing after the colon), and browser-use's
        # consecutive-failures exit breaks out of the run loop WITHOUT appending
        # anything to history. The phase then looks like a clean early finish that
        # never called done, and the session-restart machinery built for exactly this
        # case never fires. A healthy run can only end via done or max-steps, and the
        # max-steps exit DOES append an error item — so done-less + error-less + short
        # is unambiguously a dead tab. (The length guard protects against a future
        # browser-use dropping that max-steps error item.)
        if not result.is_done() and len(result) < _AGENT_MAX_STEPS:
            return (
                "Agent stopped early with no done and no recorded errors "
                "(consecutive empty state-fetch failures — wedged tab/CDP)."
            )
        return None
    combined = " ".join(errors).lower()
    if any(token in combined for token in _SESSION_LOSS_TOKENS):
        return errors[0]
    return None


def _interpret_agent_result(result: AgentHistoryList) -> dict:
    """Map browser-use AgentHistoryList to Scout apply result."""
    agent_success = result.is_successful()
    final = (result.final_result() or "").lower()
    if agent_success is True:
        return {"success": True, "error": None, "needs_attention": False}

    # The agent aborted at the submit boundary because pre_submit_check said CANCEL
    # (stop-all or an abandoned deadline attempt). Terminal, never retried — mirrors
    # the ApplyCancelled path taken when agent.stop() lands mid-step.
    if "cancelled" in final or "canceled" in final:
        return {
            "success": False,
            "error_code": "cancelled_by_user",
            "error": "stopped before submitting",
            "needs_attention": False,
        }

    # Explicit blocks the agent reported in its done text. Classified BEFORE the
    # generic done(success=False) arm — which is where they land otherwise — so they
    # reach the user as needs_attention instead of an opaque failure. Neither may
    # ever auto-retry: re-filling and re-submitting a spam-flagged application only
    # reinforces the ATS's flag (and risks a duplicate application reaching the
    # employer if the block was soft).
    if "spam" in final:
        return {
            "success": False,
            "error_code": "spam_blocked",
            "error": "The job site rejected the submission as possible spam",
            "needs_attention": True,
            "attention_question": (
                "The job site flagged this application as possible spam and refused it. "
                "Please submit it manually on the job page."
            ),
        }
    if "verification code" in final or "security code" in final:
        return {
            "success": False,
            "error_code": "verification_code_timeout",
            "error": "The job site required an emailed verification code that was not provided in time",
            "needs_attention": True,
            "attention_question": (
                "This site emailed a verification code during submission, but no code was "
                "entered in time. Re-run this application and watch the tracker for the "
                "CODE NEEDED prompt — or apply manually."
            ),
        }
    if "captcha" in final:
        return {
            "success": False,
            "error_code": "captcha_detected",
            "error": "CAPTCHA detected",
            "needs_attention": True,
            "attention_question": "CAPTCHA verification required — please apply manually",
        }

    if agent_success is False:
        return {
            "success": False,
            "error": result.final_result() or "Agent reported failure",
            "needs_attention": False,
        }

    if result.has_errors():
        errors = _collect_errors(result)
        combined = " ".join(errors).lower()
        if _is_stale_upload_failure(errors):
            return {
                "success": False,
                "error_code": "resume_upload_failed",
                "error": "Resume upload target became stale during upload. Retrying may succeed.",
                "needs_attention": False,
            }
        if _is_any_upload_failure(errors):
            return {
                "success": False,
                "error_code": "resume_upload_failed",
                "error": errors[0] if errors else "Resume upload failed",
                "needs_attention": False,
            }
        if any(
            token in combined
            for token in ("429", "resource_exhausted", "quota", "rate limit")
        ):
            return {
                "success": False,
                "error_code": "ai_quota_exceeded",
                "error": "AI quota exceeded — try again later or enable billing on Gemini",
                "needs_attention": False,
            }
        return {
            "success": False,
            "error_code": "browser_agent_failed",
            "error": errors[0] if errors else "Browser agent failed",
            "needs_attention": False,
        }

    success = any(
        word in final
        for word in (
            "submitted",
            "application received",
            "thank you",
            "confirmed",
        )
    )
    if success:
        return {
            "success": True,
            "error_code": None,
            "error": None,
            "needs_attention": False,
        }
    # Submission could not be confirmed. The agent may have actually submitted —
    # we just did not see confirmation evidence. Auto-retrying here would re-fill
    # and re-submit the SAME job, producing duplicate applications to the employer.
    # Route to manual verification instead of retrying.
    return {
        "success": False,
        "error_code": "submission_unconfirmed",
        "error": "Could not confirm the application was submitted",
        "needs_attention": True,
        "attention_question": (
            "Could not confirm this application was submitted. Please verify it on the "
            "job site (and only re-apply if it did not go through) to avoid a duplicate."
        ),
    }


class BrowserUseAgent:
    def __init__(self):
        # CONCURRENCY HAZARD (latent): browser_agent is a module singleton, so these
        # LLM clients are SHARED across every concurrent apply. That is safe ONLY under
        # process-based Celery pools (prefork in prod, solo in dev), where each worker
        # process gets its own instance and no two apply tasks share one in-memory client.
        # If the worker pool is ever switched to threads/gevent/eventlet, these singletons
        # become shared mutable state across coroutines/threads in ONE process and would
        # need per-task instances (or locking) to avoid interleaved-request bugs.
        # Do not switch pool type without addressing this.
        self.llm = ScoutBrowserLLM(temperature=0)
        self.fallback_llm = ScoutBrowserFallbackLLM(temperature=0)

    def _build_applicant_context(
        self, user_data: dict, tmp_path: str, cover_letter_path: str | None = None
    ) -> str:
        name_parts = user_data.get("name", "").split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        answers = user_data.get("answers_library", {})
        answers_text = "\n".join([
            f"- {k.replace('_', ' ').title()}: {_substitute_answer_placeholders(str(v), user_data)}"
            for k, v in answers.items() if v
        ])
        company = (user_data.get("company") or "the company").strip() or "the company"
        job_title = (user_data.get("job_title") or user_data.get("role") or "").strip()

        work_auth = user_data.get("work_authorization", "us_citizen")
        auth_map = {
            "us_citizen": "Yes, I am authorized to work in the US",
            "green_card": "Yes, I am authorized to work in the US",
            "f1_student": "No, I require sponsorship",
            "h1b": "No, I require sponsorship",
            "other_visa": "No, I require sponsorship",
        }
        auth_answer = auth_map.get(work_auth, "Yes")
        sponsorship = "Yes" if user_data.get("requires_sponsorship") else "No"

        city = user_data.get("address_city") or ""
        state = user_data.get("address_state") or ""
        street = user_data.get("address_street") or ""
        zipcode = user_data.get("address_zip") or ""
        address_lines = "\n".join(
            line
            for line in (
                f"- Street address: {street}" if street else "",
                f"- City: {city}" if city else "",
                f"- State: {state}" if state else "",
                f"- Zip / Postal code: {zipcode}" if zipcode else "",
            )
            if line
        )

        phone_national = _national_phone(user_data.get("phone_number", ""))
        details = [
            f"- First name: {first_name}",
            f"- Last name: {last_name}",
            f"- Email: {user_data.get('email', '')}",
            f"- Phone (10-digit national number, no country code): {phone_national}",
        ]
        if address_lines:
            details.extend(address_lines.splitlines())
        trailing = [
            f"- Country: {user_data.get('address_country') or 'United States'}",
            f"- LinkedIn: {user_data.get('linkedin_url', '')}",
            f"- GitHub: {user_data.get('github_url', '')}",
            f"- University/School: {user_data.get('school', '')}",
            f"- Degree (the applicant's actual degree level — use THIS for any degree field, "
            f"not the level implied by the job title): {_degree_label(user_data.get('degree_type'))}",
            f"- Major: {user_data.get('major', '')}",
            f"- GPA: {user_data.get('gpa', '')}",
        ]
        # Education dates: month/year start + expected graduation. These answer the
        # "dates attended" / "expected graduation" / "graduation year" fields some
        # forms require.
        edu_start = _format_month_year(user_data.get("education_start_date"))
        edu_end = _format_month_year(user_data.get("education_end_date"))
        if edu_start:
            trailing.append(f"- Education start date: {edu_start}")
        if edu_end:
            trailing.append(f"- Expected graduation date: {edu_end}")
            # Year-only convenience for forms that ask just the graduation year.
            year_match = re.search(r"\b(\d{4})\b", edu_end)
            if year_match:
                trailing.append(f"- Graduation year: {year_match.group(1)}")
        trailing.extend([
            f"- Resume file path: {tmp_path}",
        ])
        if cover_letter_path:
            trailing.append(f"- Cover letter file path: {cover_letter_path}")
        trailing.extend([
            f"- Work authorization question: {auth_answer}",
            f"- Requires visa sponsorship: {sponsorship}",
            f"- Employer for this application: {company}",
        ])
        if job_title:
            trailing.append(f"- Role for this application: {job_title}")
        trailing.extend(_self_identification_lines(user_data))
        trailing.extend([
            "For any open-ended text questions use these answers (placeholders already resolved):",
            answers_text if answers_text else "Use professional, concise answers based on the applicant's background.",
        ])
        details.extend(trailing)
        return "\n".join(details)

    def _build_apply_task(
        self,
        job_url: str,
        context: str,
        resume_filename: str,
        cover_letter_filename: str | None = None,
        has_pre_submit_check: bool = False,
    ) -> str:
        if has_pre_submit_check:
            pre_submit_instruction = (
                "- Immediately before clicking the final Submit button, call "
                "`pre_submit_check` once. If it returns CANCEL, do NOT click Submit — "
                "call done reporting the application was cancelled by the user "
                "(include the word 'cancelled'). If it returns OK, submit normally.\n        "
            )
        else:
            pre_submit_instruction = ""
        if cover_letter_filename:
            cover_letter_instructions = (
                f'- If the form has a cover-letter FILE-upload field, upload the COVER LETTER file '
                f'(the "Cover letter file path" in the data, which appears as "{cover_letter_filename}") '
                f'into it with a SECOND `upload_file` action, passing the `index` of the cover-letter '
                f'upload field. Do this for both required AND optional cover-letter upload fields. '
                f'(A cover-letter TEXT box is not an upload — treat it as an open-ended text question.)'
            )
        else:
            cover_letter_instructions = (
                "- If the form has a REQUIRED cover-letter FILE-upload field, upload the same resume file "
                "into it with a SECOND `upload_file` action, passing the `index` of the cover-letter "
                "upload field. Skip cover-letter uploads that are optional. (A cover-letter TEXT box is "
                "not an upload — treat it as an open-ended text question in STAGE 1/3.)"
            )
        return f"""
        Go to this job application URL and complete the ENTIRE application:
        {job_url}

        The applicant data below is a reference pool — use it to answer whatever fields THIS SPECIFIC FORM shows.
        Not every form has fields for every piece of data. Do not expect to use all of it.
        {context}

        Complete the application in this order. Do not skip ahead to a later stage before the earlier one is done.

        STAGE 1 — Fill the visible fields:
        - Look at the actual form fields first. Only fill fields that are VISIBLE and PRESENT on this specific form.
        - If a field type (address, GPA, school, LinkedIn, etc.) does not appear on the form, skip it entirely. Do not search for it or waste steps on it.
        - For phone fields with an intl-tel-input prefix (flag/country-code shown OUTSIDE the input box): type the Phone value from the data exactly as given — it is already the 10-digit national number with no country code or leading 1. Do not prepend 1 or +1.
        - Select radio buttons, checkboxes, and SHORT/simple dropdown options by CLICKING them. Never type into a radio or checkbox.
        - SEARCHABLE dropdowns / comboboxes (a dropdown with a text box that filters as you type, role=combobox — e.g. School/University, Degree, Country, and any dropdown with a long alphabetical option list): do NOT scroll the list and do NOT use page-search (off-screen options are not in the page). Click it, TYPE the value to filter, then click the matching option.
          • If typing the exact value shows NO match, try common variants of the name before giving up: toggle a leading "The" ("The University of Alabama" <-> "University of Alabama"), reorder words ("University of X" <-> "X University"), or type just the distinctive part ("Alabama"). Pick the option that clearly refers to the same institution. Do not clear-and-reopen the dropdown repeatedly — change what you TYPE instead.
        - For the Degree / education-level field, select the option matching the applicant's Degree value from the data above (e.g. "Bachelor's Degree"). Choose by the applicant's ACTUAL degree — NOT the level implied by the job title or role (a "PhD Intern" posting does NOT mean select PhD/Doctorate).
        - For autocomplete location fields: if the applicant data includes a State, type "City, State" (e.g. "Rochester, Indiana") ONCE — otherwise the city alone — wait for the suggestion list, then click the suggestion that matches the applicant's state. Do not separately fill state or country fields that the autocomplete already populated.
        - For voluntary self-identification questions (gender, race/ethnicity, Hispanic/Latino, veteran status, disability): use the "Voluntary self-identification answers" from the applicant data, picking the closest matching option the form offers. For any self-ID question the data does NOT cover, select the "Decline to self identify" / "I don't wish to answer" style option. Never guess or invent a demographic answer.
        - Do NOT retype a field that does not retain your value. If a field looks empty after ONE attempt and it is not required (no red asterisk / "required" marker), skip it and move on — do not loop on it. Only an autocomplete-location field should be retried, and only by clicking a suggestion (not by retyping).
        - Before clicking any dropdown option, refresh page state after typing and use the latest index only. Never reuse an index after any input, scroll, or click.

        STAGE 2 — Upload the resume:
        - Only after the visible non-resume fields are filled, upload the resume as its own isolated action.
        - To upload, call the `upload_file` action with the resume file path. The file input may be hidden — you do NOT need to click anything first; `upload_file` will locate it. You may omit the index.
        - Do NOT type the file path into any field. Do NOT click a button that opens a system file-picker dialog (you cannot interact with OS dialogs).
        - The uploaded file will appear on the form as "{resume_filename}". Verify that filename / an upload confirmation is visible before moving on.
        {cover_letter_instructions}

        STAGE 3 — Submit:
        - Fill any remaining VISIBLE required fields that are still empty. Skip applicant data that has no corresponding form field.
        - Submit the application only after the resume upload is confirmed and all visible required fields are satisfied.
        {pre_submit_instruction}- Confirm success with clear evidence (submitted / thank you / application received) and state that evidence in your done message.
        - If after submitting a banner says the application was flagged as possible spam, wait 15 seconds, then click Submit ONCE more (the banner itself invites a resubmit). If it is flagged as spam again, stop — do not keep retrying — and call done reporting the spam block (include the word "spam" in your done text).
        - If submitting reveals an emailed verification/security code step ("a code was sent to <email>"), call `request_verification_code` (pass sent_to and code_length from the page). When it returns the code: click the FIRST code input box, type the ENTIRE code in one input action, then continue the submission. If it returns without a code, call it again — up to 3 calls total. If no code arrives after 3 calls, call done reporting that the emailed verification code was not provided (include the words "verification code").
        - If blocked by a CAPTCHA, report it explicitly in your done message.

        Notes:
        - You may put a long free-text answer in a single input action; the system enters it instantly in one shot. Do not break essay answers up yourself.
        - Call done only when the application has been submitted and you have seen a confirmation, OR when you are genuinely blocked (CAPTCHA, or required info you cannot answer from the data).
        """

    async def _run_phase(
        self,
        *,
        phase_name: str,
        task: str,
        browser: Browser,
        tmp_path: str,
        cover_letter_path: str | None = None,
        max_actions_per_step: int = 5,
        step_timeout: int = _AGENT_STEP_TIMEOUT,
        application_id: str | None = None,
        control_token: str | None = None,
        on_gate=None,
        fetch_code=None,
        on_code=None,
    ) -> AgentHistoryList:
        logger.info("Starting browser agent phase: %s", phase_name)
        available_files = [tmp_path]
        if cover_letter_path:
            available_files.append(cover_letter_path)
        agent = Agent(
            task=task,
            llm=self.llm,
            fallback_llm=self.fallback_llm,
            use_thinking=False,
            flash_mode=_FLASH_MODE,
            browser=browser,
            tools=_build_apply_tools(
                application_id,
                control_token=control_token,
                on_gate=on_gate,
                fetch_code=fetch_code,
                on_code=on_code,
            ),
            available_file_paths=available_files,
            max_actions_per_step=max_actions_per_step,
            max_failures=_AGENT_MAX_FAILURES,
            step_timeout=step_timeout,
            include_attributes=[ 'id', 'type', 'aria-label', 'aria-labelledby',
                                 'placeholder', 'role', 'aria-required', 'value',
                                 'aria-expanded', 'name'],
        )
        # Stop-all watcher: aborts this live run within seconds of the user
        # clicking Stop All (the DB-status check alone only blocks queued tasks).
        cancelled = asyncio.Event()
        watcher: asyncio.Task | None = None
        if application_id:
            redis_client = get_redis()
            flag_key = cancel_key(application_id)

            async def _watch_cancel():
                while True:
                    await asyncio.sleep(_CANCEL_POLL_INTERVAL)
                    try:
                        flagged = await asyncio.to_thread(redis_client.get, flag_key)
                    except Exception:
                        continue  # Redis blip — keep watching
                    if flagged:
                        cancelled.set()
                        logger.info(
                            "Stop-all received — stopping agent run for application %s",
                            application_id,
                        )
                        agent.stop()
                        return

            watcher = asyncio.create_task(_watch_cancel())

        try:
            result = await asyncio.wait_for(
                agent.run(max_steps=_AGENT_MAX_STEPS),
                timeout=_AGENT_RUN_TIMEOUT,
            )
        except asyncio.TimeoutError as exc:
            # A CDP stall/deadlock (e.g. screenshot -32603, ax_tree hang) can make
            # agent.run() spin forever. Surface it as a recoverable session loss
            # instead of letting the worker hang until Celery SIGKILLs it.
            logger.error(
                "Phase %s exceeded hard timeout of %ss; treating as browser session loss.",
                phase_name,
                _AGENT_RUN_TIMEOUT,
            )
            raise BrowserPhaseTimeout(
                f"Phase {phase_name} exceeded {_AGENT_RUN_TIMEOUT}s hard timeout"
            ) from exc
        finally:
            if watcher is not None:
                watcher.cancel()
        if cancelled.is_set():
            raise ApplyCancelled(
                f"Application {application_id} cancelled by user mid-run (stop-all)"
            )
        if not isinstance(result, AgentHistoryList):
            result = AgentHistoryList.model_validate(result)
        logger.info("Completed browser agent phase %s: %s", phase_name, result)
        return result

    async def _run_phase_resilient(
        self,
        *,
        phase_name: str,
        task: str,
        browser: Browser,
        session_id: str | None,
        tmp_path: str,
        cover_letter_path: str | None = None,
        max_actions_per_step: int,
        step_timeout: int,
        retry_stale_click_once: bool = False,
        retry_type_timeout_once: bool = False,
        application_id: str | None = None,
        geolocation: dict | None = None,
        control_token: str | None = None,
        on_gate=None,
        fetch_code=None,
        on_code=None,
    ) -> tuple[AgentHistoryList, Browser, str | None]:
        """
        Run a phase with bounded self-healing:
        - fast session recreation on hard session-loss/watchdog failures
        - one targeted rerun for stale click failures
        """
        stale_click_retries = 0
        type_timeout_retries = 0
        session_restarts = 0
        attempt = 0
        current_browser = browser
        current_session_id = session_id
        current_task = task

        while True:
            attempt += 1
            result = await self._run_phase(
                phase_name=f"{phase_name}_attempt_{attempt}",
                task=current_task,
                browser=current_browser,
                tmp_path=tmp_path,
                cover_letter_path=cover_letter_path,
                max_actions_per_step=max_actions_per_step,
                step_timeout=step_timeout,
                application_id=application_id,
                control_token=control_token,
                on_gate=on_gate,
                fetch_code=fetch_code,
                on_code=on_code,
            )
            errors = _collect_errors(result)
            session_loss = _session_loss_reason(result)
            watchdog_hit = _phase_watchdog_triggered(errors)

            if session_loss or watchdog_hit:
                if session_restarts >= _PHASE_MAX_SESSION_RESTARTS:
                    return result, current_browser, current_session_id
                logger.warning(
                    "Phase %s detected unstable browser state (%s). Recreating session and rerunning.",
                    phase_name,
                    session_loss or "watchdog-triggered repeated state failures",
                )
                await self._release_browser_session(current_browser, current_session_id)
                new_session, current_browser = self._new_browser_session(geolocation)
                current_session_id = new_session.id
                session_restarts += 1
                continue

            if retry_stale_click_once and _is_stale_click_failure(errors):
                if stale_click_retries >= _PHASE_MAX_STALE_CLICK_RETRIES:
                    return result, current_browser, current_session_id
                stale_click_retries += 1
                logger.warning(
                    "Phase %s stale click failure detected; retrying with fresh-state click guidance.",
                    phase_name,
                )
                current_task = (
                    f"{task}\n\n"
                    "Retry guidance:\n"
                    "- The previous attempt failed due to a stale click target.\n"
                    "- Re-read page state immediately before every dropdown-option click.\n"
                    "- Never click an option index from earlier state.\n"
                )
                continue

            if retry_type_timeout_once and _is_type_timeout_failure(errors):
                if type_timeout_retries >= _PHASE_MAX_TYPE_TIMEOUT_RETRIES:
                    return result, current_browser, current_session_id
                type_timeout_retries += 1
                logger.warning(
                    "Phase %s text-entry timeout detected; retrying with break-up guidance.",
                    phase_name,
                )
                current_task = (
                    f"{task}\n\n"
                    "Retry guidance:\n"
                    "- A previous text entry timed out. Re-select the field, then enter the answer again.\n"
                    "- If it times out a second time, split the answer across two shorter input actions into the same field (use clear=False on the second so it appends).\n"
                    "- After entering, verify the field shows the text before moving on.\n"
                )
                continue

            return result, current_browser, current_session_id

    def _new_browser_session(self, geolocation: dict | None = None):
        # Hardened, shared session config (timeout/region/block_ads/captcha) lives
        # in core.browserbase so every session is configured identically. geolocation
        # geo-targets the residential proxy to the applicant (no-op unless proxies on).
        session = create_browserbase_session(geolocation=geolocation)
        browser = Browser(
            browser_profile=BrowserProfile(
                cdp_url=session.connect_url,
                keep_alive=True,
            )
        )
        return session, browser

    async def _release_browser_session(self, browser: Browser | None, session_id: str | None) -> None:
        # REST release FIRST: a plain HTTPS call that terminates the remote browser even
        # when the tab's CDP target is wedged. The old kill-then-release order deadlocked
        # for ~7 minutes on a wedged socket (kill() awaits CDP/event-bus work with no
        # timeout) and the release never ran — a zombie session burning plan minutes
        # until the 900s session timeout. Releasing remotely also closes the WebSocket,
        # so the bounded local kill() below fails fast instead of hanging. The release
        # call is synchronous on purpose: it cannot be interrupted by task cancellation.
        if session_id:
            release_browserbase_session(session_id)
        if browser is not None:
            try:
                await asyncio.wait_for(browser.kill(), timeout=_BROWSER_KILL_TIMEOUT)
            except Exception:
                logger.debug(
                    "browser.kill() failed or timed out after REST release", exc_info=True
                )

    def apply(
        self,
        *,
        job_url: str,
        user_data: dict,
        resume_pdf: bytes,
        application_id: str | None = None,
        cover_letter_pdf: bytes | None = None,
        deadline_seconds: float = 870,
        control_token: str | None = None,
        on_gate=None,
        fetch_code=None,
        on_code=None,
    ) -> dict:
        """
        Synchronous façade with the SAME signature and result contract as
        services.browserbase_agent.BrowserbaseAgent.apply, so tasks/job_tasks.py
        swaps engines behind SCOUT_APPLY_ENGINE without touching the call site.

        The hard wall-clock budget is enforced here (asyncio.wait_for): on deadline
        the pipeline coroutine is cancelled — the in-process agent dies with it (no
        unkillable server-side run) and the finally still releases the Browserbase
        session and temp files. control_token/on_gate/fetch_code/on_code are the
        task's verification-gate hooks (see _install_verification_relay and
        _install_pre_submit_check); all optional — without them behavior degrades
        to the manual-paste relay.
        """
        try:
            return asyncio.run(
                asyncio.wait_for(
                    self._apply_async(
                        job_url=job_url,
                        user_data=user_data,
                        resume_pdf=resume_pdf,
                        application_id=application_id,
                        cover_letter_pdf=cover_letter_pdf,
                        control_token=control_token,
                        on_gate=on_gate,
                        fetch_code=fetch_code,
                        on_code=on_code,
                    ),
                    timeout=deadline_seconds,
                )
            )
        except TimeoutError:  # asyncio.TimeoutError is this builtin on 3.11+
            logger.error(
                "Apply pipeline exceeded %ss hard deadline (application %s)",
                deadline_seconds, application_id,
            )
            # Mark THIS attempt's token cancelled: nothing of the cancelled run can
            # survive in-process, but the token also feeds /apply-control for any
            # observer, and it keeps the retry attempt honest if Redis state lags.
            if control_token:
                try:
                    get_redis().setex(
                        cancelled_token_key(control_token), CONTROL_TOKEN_TTL, "1"
                    )
                except Exception:
                    pass
            # Parked on the verification gate when time ran out? A retry would
            # re-submit the whole form and trigger a fresh code — hand it to the
            # user instead (mirrors the hosted engine's deadline path).
            gate_hit = False
            if application_id:
                try:
                    gate_hit = bool(get_redis().get(gate_key(application_id)))
                except Exception:
                    gate_hit = False
            if gate_hit:
                return {
                    "success": False,
                    "error_code": "verification_code_timeout",
                    "error": "Verification wait exceeded the apply deadline",
                    "needs_attention": True,
                    "attention_question": (
                        "This application was waiting on an emailed verification "
                        "code when time ran out. Please check the job site and "
                        "finish it manually if it did not go through."
                    ),
                }
            return {
                "success": False,
                "error_code": "browser_session_lost",
                "error": f"apply run exceeded {deadline_seconds}s deadline",
                "needs_attention": False,
            }

    async def _apply_async(
        self,
        *,
        job_url: str,
        user_data: dict,
        resume_pdf: bytes,
        application_id: str | None = None,
        cover_letter_pdf: bytes | None = None,
        control_token: str | None = None,
        on_gate=None,
        fetch_code=None,
        on_code=None,
    ) -> dict:
        # Own temp dir so the file's basename is the personalized, ATS-visible
        # filename (e.g. Rabuor_Tindi_Resume.pdf) — the byte-inject upload names the
        # in-page File after the basename, and a generic/random name is a spam tell.
        tmp_dir = tempfile.mkdtemp(prefix="scout_resume_")
        upload_filename = resume_filename(user_data.get("name"))
        tmp_path = os.path.join(tmp_dir, upload_filename)
        with open(tmp_path, "wb") as fh:
            fh.write(resume_pdf)

        # Cover letter is optional: when present, write a second personalized file the
        # agent can upload into a cover-letter field. When absent, everything below is
        # byte-for-byte the validated single-file path (available_file_paths=[resume]).
        cover_letter_path: str | None = None
        cover_letter_upload_name: str | None = None
        if cover_letter_pdf:
            cover_letter_upload_name = cover_letter_filename(user_data.get("name"))
            cover_letter_path = os.path.join(tmp_dir, cover_letter_upload_name)
            with open(cover_letter_path, "wb") as fh:
                fh.write(cover_letter_pdf)

        session = None
        active_session_id: str | None = None
        browser = None

        context = self._build_applicant_context(user_data, tmp_path, cover_letter_path)
        apply_task = self._build_apply_task(
            job_url, context, upload_filename, cover_letter_upload_name,
            has_pre_submit_check=bool(application_id or control_token),
        )

        # Geo-target the residential proxy to the applicant's address so the exit IP
        # matches the form (Ashby's named "location mismatch" signal). No-op unless
        # BROWSERBASE_PROXIES is on; None falls back to a plain residential proxy.
        geolocation = _build_geolocation(user_data)

        try:
            session, browser = self._new_browser_session(geolocation)
            active_session_id = session.id if session else None

            # One continuous agent run: fill → upload → submit. A single CDP init and
            # one continuous agent memory keep the Browserbase session lifetime short,
            # which is the main defense against the mid-application session rot that
            # the old per-phase handoff caused.
            result, browser, current_session_id = await self._run_phase_resilient(
                phase_name="apply",
                task=apply_task,
                browser=browser,
                session_id=active_session_id,
                tmp_path=tmp_path,
                cover_letter_path=cover_letter_path,
                max_actions_per_step=1,
                step_timeout=_AGENT_STEP_TIMEOUT,
                retry_stale_click_once=True,
                retry_type_timeout_once=True,
                application_id=application_id,
                geolocation=geolocation,
                control_token=control_token,
                on_gate=on_gate,
                fetch_code=fetch_code,
                on_code=on_code,
            )
            active_session_id = current_session_id

            session_loss = _session_loss_reason(result)
            if session_loss:
                return {
                    "success": False,
                    "portal": "browser_use",
                    "session_id": active_session_id,
                    "error_code": "browser_session_lost",
                    "error": f"Browser session lost: {session_loss}",
                    "needs_attention": False,
                }

            outcome = _interpret_agent_result(result)
            return {
                "portal": "browser_use",
                "session_id": active_session_id,
                **outcome,
            }

        except ApplyCancelled:
            # Stop-all: the row is already failed/cancelled_by_user (the endpoint set
            # it); just report the cancellation so job_tasks takes its no-retry path.
            logger.info("Apply run cancelled by user (application %s)", application_id)
            return {
                "success": False,
                "portal": "browser_use",
                "session_id": active_session_id,
                "error_code": "cancelled_by_user",
                "error": "stopped from the tracker",
                "needs_attention": False,
            }

        except BrowserPhaseTimeout as e:
            # Hard wall-clock cap hit (likely a CDP stall). Report as a recoverable
            # session loss so the task is retried with backoff rather than failed hard.
            logger.error(f"BrowserUseAgent timed out: {e}")
            return {
                "success": False,
                "portal": "browser_use",
                "session_id": active_session_id,
                "error_code": "browser_session_lost",
                "error": f"Browser session lost: {e}",
                "needs_attention": False,
            }

        except Exception as e:
            logger.error(f"BrowserUseAgent failed: {e}")
            return {
                "success": False,
                "portal": "browser_use",
                "session_id": active_session_id,
                "error": str(e),
                "needs_attention": False
            }

        finally:
            await self._release_browser_session(browser, active_session_id)
            shutil.rmtree(tmp_dir, ignore_errors=True)


browser_agent = BrowserUseAgent()
