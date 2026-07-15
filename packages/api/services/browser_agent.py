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
import hashlib
import json
import logging

import sentry_sdk
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

from core.browserbase import (
    BROWSERBASE_PROXIES,
    BROWSERBASE_REGION,
    create_session as create_browserbase_session,
    get_client as get_browserbase_client,
    release_session as release_browserbase_session,
)
from core.redis_client import (
    CONTROL_TOKEN_TTL,
    GATE_FLAG_TTL,
    PENDING_OTP_TTL,
    cancel_key,
    cancelled_token_key,
    gate_key,
    get_redis,
    pending_otp_key,
    verification_code_key,
)
from core.supabase_client import supabase
from services.browser_form_gates import (
    _JS_CLASSIFY_POST_SUBMIT,
    _JS_FINGERPRINT_PROBE,
    _JS_SCAN_REQUIRED_FIELDS,
    classify_post_submit_payload,
    evaluate_required_inventory,
    final_text_looks_confirmed,
    final_text_looks_like_spam,
    hash_inventory,
    inventory_telemetry_summary,
    required_field_blocker_message,
    timezone_geo_mismatch,
)
from services.browser_session_policy import resolve_block_ads, resolve_portal

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
    "rejected the upload",
    "site rejected",
    "upload verification",
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

# Keystroke-level realistic typing — the PRIMARY long-text path and a TOOL-LEVEL
# guarantee (not a prompt suggestion the model may ignore). Long free-text is entered
# as genuine per-character CDP key events (keydown → char/input → keyup) so the field
# receives a real keystroke STREAM with human-like inter-key timing. This is stronger
# than trusted insertText (the previous default), which fires input events but NO
# keydown/keyup at all — a field that fills with zero key events is exactly the
# behavioral tell Ashby-class spam scoring keys on (form-interaction irregularities /
# timing anomalies). Toggle off to A/B or if remote CDP latency proves too costly:
# SCOUT_KEYSTROKE_TYPING=false falls back to the humanized word-chunk insertText path.
_KEYSTROKE_TYPING = os.getenv("SCOUT_KEYSTROKE_TYPING", "true").strip().lower() in {
    "1", "true", "yes", "on",
}
# Per-character base delay window (seconds). Deliberately a RANGE, not a fixed value —
# a perfectly uniform inter-key interval is itself an automation signature. Brisk
# (well above human WPM) but varied; the point is a realistic event stream + variance,
# not literal human speed, so long answers stay inside the step/run budgets.
_KEYSTROKE_CHAR_DELAY = (0.018, 0.055)
# Occasional longer "thinking" pause; probability is raised after sentence/clause
# punctuation (where humans naturally pause), producing bursty, non-metronomic timing.
_KEYSTROKE_PAUSE_CHANCE = 0.06
_KEYSTROKE_PAUSE_RANGE = (0.15, 0.45)
# Wall-clock budget (seconds) for one field. Per-char delay scales DOWN toward the floor
# to fit this on very long answers, so keystroke typing can never approach the 150s step
# cap. See the timing note in _type_long_text_keystrokes.
_KEYSTROKE_TIME_BUDGET = 35.0
_KEYSTROKE_MIN_DELAY = 0.006
# Above this length, skip per-char typing (too many CDP round-trips to risk the step
# budget) and use the humanized trusted word-chunk insertText path instead. Virtually
# all real ATS free-text answers (essays, "why this company", short cover letters) sit
# well under this.
_KEYSTROKE_MAX_CHARS = 3000

# Honeypot avoidance. Spam scorers plant fields humans never see (CSS-hidden, moved
# off-screen, 1px, opacity 0, aria-hidden, tabindex=-1) — a filled honeypot is a
# guaranteed bot verdict. The input tool refuses to type into any field the in-page
# check flags as non-visible. Toggle: SCOUT_HONEYPOT_GUARD=false.
_HONEYPOT_GUARD = os.getenv("SCOUT_HONEYPOT_GUARD", "true").strip().lower() in {
    "1", "true", "yes", "on",
}
# Name/id tokens classic honeypots use. These are ONLY treated as traps when the field
# is ALSO weakly hidden (aria-hidden / tabindex=-1) — a VISIBLE "website"/"url" field is
# a legitimate portfolio/LinkedIn input and must stay fillable.
_HONEYPOT_NAME_TOKENS = (
    "honeypot", "honey_pot", "hp_", "_hp", "confirm_email", "email_confirm",
    "url", "website", "homepage", "home_page", "fax", "company_website",
    "b_", "winnie",  # common WordPress/Contact-Form-7/mailchimp honeypot prefixes
)

# Realistic pointer clicks. Real users move the cursor to a control before pressing it;
# a click with no preceding pointer movement is a behavioral tell. We trace a short,
# jittered mousemove path to the target's center, then let browser-use's own (trusted
# CDP) click do the press/release. Toggle: SCOUT_HUMANIZED_CLICK=false.
_HUMANIZED_CLICK = os.getenv("SCOUT_HUMANIZED_CLICK", "true").strip().lower() in {
    "1", "true", "yes", "on",
}
_CLICK_MOVE_STEPS = (5, 10)  # random number of intermediate mousemove events
_CLICK_MOVE_STEP_DELAY = (0.008, 0.022)  # seconds between mousemove events
_CLICK_PRE_PRESS_DWELL = (0.04, 0.12)  # brief settle once the cursor arrives

# Realistic scrolling. browser-use reaches below-fold elements with an instant
# programmatic DOM.scrollIntoViewIfNeeded jump, so an entire multi-screen form can be
# filled and submitted with ZERO wheel events — page telemetry that no human can
# produce (2026-07-12 Ashby investigation: this and focus-without-pointer were the
# biggest remaining behavioral artifacts; the session fingerprint/IP were verified
# stable). When a click/type target is off-screen we first wheel the page toward it
# with real Input.dispatchMouseEvent mouseWheel bursts, exactly what a trackpad/wheel
# emits; the programmatic jump stays as the fallback for inner scroll containers the
# page wheel can't reach. Toggle: SCOUT_HUMANIZED_SCROLL=false.
_HUMANIZED_SCROLL = os.getenv("SCOUT_HUMANIZED_SCROLL", "true").strip().lower() in {
    "1", "true", "yes", "on",
}
_SCROLL_WHEEL_STEP = (160, 420)  # px per wheel event (chunky, like real wheel clicks)
_SCROLL_STEP_DELAY = (0.05, 0.13)  # seconds between wheel events
_SCROLL_MAX_EVENTS = 25  # hard cap so a hidden/unreachable target can't spin forever
_SCROLL_TARGET_BAND = (0.30, 0.55)  # settle the target's center into this viewport band

# Submission pacing. A form completed and submitted in a couple of seconds is a
# too-fast tell. pre_submit_check (called immediately before the final Submit) sleeps a
# randomized human "final read" beat so submission is never instant. Toggle:
# SCOUT_SUBMIT_DWELL=false.
_SUBMIT_DWELL = os.getenv("SCOUT_SUBMIT_DWELL", "true").strip().lower() in {
    "1", "true", "yes", "on",
}
_SUBMIT_DWELL_RANGE = (1.6, 3.6)  # seconds paused before the final submit
# pre_submit_check may be called repeatedly while the agent finishes fields.
# Cap calls so a stuck planner cannot spin forever; require two consecutive
# identical inventories before allowing submit (combobox commit lag).
_PRE_SUBMIT_MAX_CALLS = 5
_PRE_SUBMIT_FIXED_POINT_ROUNDS = 2
_PRE_SUBMIT_SETTLE_SECONDS = 0.4

# Native trusted file attach. The file is first uploaded to the Browserbase SESSION
# (POST /v1/sessions/{id}/uploads — lands at /tmp/.uploads/<name> inside the remote
# browser's filesystem), then attached with CDP DOM.setFileInputFiles pointing at
# that remote path. That is the browser-native picker path: Chrome itself fires the
# input/change events, isTrusted=true, indistinguishable from a human choosing the
# file. The in-page byte-injection fallback (_attach_resume_bytes) dispatches
# SYNTHETIC events (isTrusted=false) on the file input — the exact moment
# Ashby/Fingerprint-class fraud scoring watches hardest. Toggle: SCOUT_NATIVE_UPLOAD=false.
_NATIVE_UPLOAD = os.getenv("SCOUT_NATIVE_UPLOAD", "true").strip().lower() in {
    "1", "true", "yes", "on",
}
# Native staging is asynchronous inside Browserbase even after the uploads API
# returns. Probe the remote file on a detached input before touching the ATS input.
_REMOTE_FILE_READY_TIMEOUT = 5.0
_REMOTE_FILE_READY_POLL = 0.20
# ATS uploads settle at different speeds. Poll attempt-scoped state instead of taking
# one fixed snapshot: fast positive UI can finish early, while slower failures get a
# bounded window to surface.
_UPLOAD_SETTLE_MIN = 1.5
# Ashby: CreateFileUploadHandle → S3 POST → setFormValueToFile. False "accepted"
# from a Delete control alone caused spam/submit-with-broken-resume (2026-07-14).
# Wait long enough for S3+GraphQL; never accept without network confirmation.
_UPLOAD_SETTLE_TIMEOUT = 14.0
_UPLOAD_SETTLE_POLL = 0.25
# Soft signal only — Delete/Remove may appear before S3 finishes. Kept for telemetry,
# not as an acceptance gate.
_UPLOAD_ATTACHED_QUIET_GRACE = 5.0

# A consolidated run does fill + upload + submit in one continuous agent.
# Bound it by both a step budget and a hard wall-clock cap that sits comfortably
# below the Celery soft_time_limit (900s), so the agent always yields a clean
# result before Celery can SIGKILL it mid-action. The budget ladder must hold:
# _AGENT_RUN_TIMEOUT < APPLY_PIPELINE_TIMEOUT (job_tasks) < Celery soft < hard
# < Browserbase session timeout (core/browserbase). 840s covers a full multi-field
# form + upload + submit (a clean Greenhouse run is ~25-35 steps) PLUS up to ~6
# minutes of request_verification_code waiting for the user to paste an emailed
# ATS code into the tracker.
# 60 steps: the 40-step budget (set on the "more than 40 is thrashing" theory)
# failed a NON-thrashing run on 2026-07-10 — a long Tenstorrent university
# Greenhouse form (education + ~10 custom questions + self-ID + 3 file uploads)
# had ~31 productive steps done and legitimate required work remaining when the
# budget ran out. 60 (55 + safety net) just fits _AGENT_RUN_TIMEOUT at the
# observed ~11-13s/step — the wall clock, not the step budget, is now the
# binding cap on the slowest runs.
_AGENT_MAX_STEPS = int(os.getenv("SCOUT_AGENT_MAX_STEPS", "60"))
_AGENT_RUN_TIMEOUT = 840  # seconds — hard cap on a single agent.run()
# flash_mode strips the thinking/evaluation fields from every step's LLM output —
# output tokens are the latency-dominant cost of a step. Provider-conditional
# default: ON only for the ChatBrowserUse gateway (tuned for the stripped schema);
# OFF on the OpenAI path, where gpt-5.4-mini needs the evaluation field as its
# self-correction channel (2026-07-09 postmortem: flash mode removed the only slot
# where the model could notice its actions were no-ops). An explicit
# SCOUT_BROWSER_FLASH_MODE env value overrides the default either way (A/B knob).
def _flash_mode_default() -> bool:
    provider = os.getenv("SCOUT_BROWSER_LLM", "browser_use").strip().lower()
    return provider == "browser_use" and bool(os.getenv("BROWSER_USE_API_KEY"))


_FLASH_MODE_ENV = os.getenv("SCOUT_BROWSER_FLASH_MODE", "").strip().lower()
_FLASH_MODE = (
    _FLASH_MODE_ENV in {"1", "true", "yes", "on"}
    if _FLASH_MODE_ENV
    else _flash_mode_default()
)
_AGENT_STEP_TIMEOUT = 150  # seconds — per-step cap so a stuck step fails fast
# Verification-code relay: one tool call polls Redis for this long (kept under
# _AGENT_STEP_TIMEOUT so the step never times out), checking every few seconds.
# The prompt allows up to 3 calls, giving the user ~6 minutes total to respond.
_VERIFICATION_POLL_TIMEOUT = 120  # seconds per request_verification_code call
_VERIFICATION_POLL_INTERVAL = 3  # seconds between Redis checks
_VERIFICATION_MAX_CALLS = 3
# Pull-source (fetch_code) cadence between attempts while the relay is polling.
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
# Cap on event-loop shutdown after the apply pipeline returns. asyncio.run()'s own
# cleanup is UNBOUNDED: it cancels leftover tasks and then waits for them (and for
# default-executor threads) forever. browser-use's teardown can strand event-bus
# handlers that never finish cancelling (seen live 2026-07-14: spam-blocked run
# completed, apply.outcome.final emitted, then the worker hung >90 min in loop
# shutdown — the Celery task never reached its needs_attention/refund handlers).
_LOOP_SHUTDOWN_TIMEOUT = 15
# The ATS records the basename of the injected resume as the filename. apply() writes
# the temp file under a personalized name (resume_filename() below — e.g.
# "Rabuor_Tindi_Resume.pdf"), so the basename is always presentable; a
# generic/random name is a bot tell for spam scoring.


class BrowserPhaseTimeout(Exception):
    """Raised when an agent run exceeds its hard wall-clock budget (likely a CDP stall)."""


class PlannerDeadlock(Exception):
    """Raised when the loop watchdog sees the same action repeated with no page
    change past the abort threshold (2026-07-09 postmortem: schema-degraded steps
    looped `navigate` to the same URL as a chain of "successful" no-ops that
    max_failures never counts)."""


# Loop watchdog thresholds: at N identical consecutive (actions, url) steps the
# model gets a corrective nudge injected into its next-step context; at the abort
# threshold the run stops with PlannerDeadlock and feeds the retry ladder.
# request_verification_code / pre_submit_check / wait / done are exempt — the OTP
# relay legitimately repeats identical calls while polling for the emailed code.
_WATCHDOG_NUDGE_AT = 3
_WATCHDOG_ABORT_AT = 5
_WATCHDOG_EXEMPT_ACTIONS = {
    "request_verification_code",
    "pre_submit_check",
    "post_submit_check",
    "wait",
    "done",
}


def _emit_apply_telemetry(
    event: str,
    payload: dict,
    *,
    application_id: str | None = None,
    level: str = "info",
) -> None:
    """Structured, redacted apply telemetry — never log field values or PII."""
    safe = {
        k: v
        for k, v in (payload or {}).items()
        if k
        not in {
            "email",
            "phone",
            "name",
            "address",
            "resume",
            "connect_url",
            "token",
            "api_key",
            "value",
        }
    }
    if application_id:
        safe.setdefault("application_id", application_id)
    line = f"apply_telemetry event={event} {json.dumps(safe, default=str)}"
    if level == "warning":
        logger.warning(line)
    else:
        logger.info(line)
    try:
        sentry_sdk.add_breadcrumb(
            category="apply",
            message=event,
            data=safe,
            level=level if level in {"info", "warning", "error"} else "info",
        )
    except Exception:
        pass


def _attach_apply_diagnostics(
    diagnostics: dict | None,
    *,
    portal: str | None = None,
    error_code: str | None = None,
) -> None:
    """Attach redacted session diagnostics to the current Sentry scope."""
    if not diagnostics:
        return
    try:
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("portal", portal or "unknown")
            if error_code:
                scope.set_tag("apply_blocker", error_code)
            scope.set_context("apply_diagnostics", diagnostics)
            if error_code in {"spam_blocked", "resume_upload_failed", "captcha_detected"}:
                sentry_sdk.capture_message(
                    f"apply_terminal:{error_code}",
                    level="warning",
                )
    except Exception:
        logger.debug("Failed to attach apply diagnostics to Sentry", exc_info=True)


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


def _key_event_params(ch: str) -> tuple[dict, dict]:
    """Build (keyDown, keyUp) CDP Input.dispatchKeyEvent params for one character.

    The keyDown carries `text`, which is what makes the browser produce the
    keypress/beforeinput/input sequence and insert the character (mirrors how a
    real key produces input). `key`/`code`/`windowsVirtualKeyCode` are populated for
    alphanumerics and space so the emitted keydown/keyup look like genuine key
    presses (a keydown with keyCode 0 / empty code is itself a tell); punctuation
    keeps a generic descriptor since its physical code is layout-specific and a
    missing code there is unremarkable. A newline becomes a real Enter press.
    """
    if ch == "\n":
        base = {"key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13}
        return {**base, "type": "keyDown", "text": "\r"}, {**base, "type": "keyUp"}

    code = ""
    vk = 0
    if ch.isascii() and ch.isalpha():
        code = "Key" + ch.upper()
        vk = ord(ch.upper())
    elif ch.isascii() and ch.isdigit():
        code = "Digit" + ch
        vk = ord(ch)
    elif ch == " ":
        code = "Space"
        vk = 32

    down: dict[str, str | int] = {
        "type": "keyDown",
        "key": ch,
        "text": ch,
        "unmodifiedText": ch,
    }
    up: dict[str, str | int] = {"type": "keyUp", "key": ch}
    if code:
        down["code"] = up["code"] = code
    if vk:
        down["windowsVirtualKeyCode"] = up["windowsVirtualKeyCode"] = vk
    return down, up


def _normalize_newlines(s: str) -> str:
    return s.replace("\r\n", "\n").replace("\r", "\n")


async def _type_long_text_keystrokes(browser_session, index: int, text: str):
    """
    Enter long free-text as a genuine per-character keystroke stream via CDP
    Input.dispatchKeyEvent (keydown → char/input → keyup per character), with
    human-like inter-key timing and light jitter.

    This is the tool-level guarantee that replaces "ask the model to type in chunks":
    the pacing, chunking, and per-key event emission happen HERE regardless of which
    model/provider drives the run and regardless of how the model passes the text
    (one action, whole string) — the model never orchestrates it. Word-chunk
    insertText (the prior default) fires input events but zero keydown/keyup, so a
    field could fill with no key-event telemetry at all; a spam scorer watching form
    interaction sees that instantly. Real key events with varied timing remove that tell.

    Returns an ActionResult on success, or None so the caller falls back to
    _set_long_text_trusted / _set_long_text_via_js when: keystroke typing is disabled;
    the text exceeds _KEYSTROKE_MAX_CHARS; the element isn't a plain <input>/<textarea>;
    the field already holds text (dispatchKeyEvent inserts at the caret and would
    APPEND — only safe on an empty field); or the post-type verification fails.

    Timing: per-char delay is drawn from _KEYSTROKE_CHAR_DELAY (~18-55ms) with
    occasional longer pauses, so a ~300-char answer lands in ~10-15s and a ~600-char
    one in ~20-30s. For longer answers the delay window is scaled DOWN to fit
    _KEYSTROKE_TIME_BUDGET (35s), floored at _KEYSTROKE_MIN_DELAY — so the typing delay
    can never approach the 150s per-step cap. (CDP round-trips add to this; keeping the
    Browserbase region matched to the worker keeps that overhead small — see CLAUDE.md.)
    """
    if not _KEYSTROKE_TYPING or len(text) > _KEYSTROKE_MAX_CHARS:
        return None
    node = await browser_session.get_dom_element_by_index(index)
    if node is None or node.tag_name not in ("input", "textarea"):
        return None
    is_textarea = node.tag_name == "textarea"
    # A single-line <input> can't hold newlines, and a stray Enter there could submit
    # the form — collapse newlines to spaces for inputs; keep them (real Enter) for
    # textareas, which is where essay/cover-letter answers live.
    typed_text = text if is_textarea else _normalize_newlines(text).replace("\n", " ")
    if not typed_text:
        return None

    cdp_session = await browser_session.cdp_client_for_node(node)
    try:
        await cdp_session.cdp_client.send.DOM.scrollIntoViewIfNeeded(
            params={"backendNodeId": node.backend_node_id},
            session_id=cdp_session.session_id,
        )
    except Exception:
        pass  # node may still be typable even if scroll fails
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

    # dispatchKeyEvent inserts at the caret without clearing — only safe on an empty field.
    current = await _read_value()
    if isinstance(current, str) and current.strip():
        return None

    await cdp_session.cdp_client.send.DOM.focus(
        params={"backendNodeId": node.backend_node_id},
        session_id=cdp_session.session_id,
    )

    # Scale the per-char delay window down if the answer is long enough that typing at
    # the natural cadence would exceed the field time budget.
    lo, hi = _KEYSTROKE_CHAR_DELAY
    projected = len(typed_text) * ((lo + hi) / 2)
    if projected > _KEYSTROKE_TIME_BUDGET:
        scale = _KEYSTROKE_TIME_BUDGET / projected
        lo = max(_KEYSTROKE_MIN_DELAY, lo * scale)
        hi = max(_KEYSTROKE_MIN_DELAY, hi * scale)

    prev = ""
    for ch in typed_text:
        down, up = _key_event_params(ch)
        await cdp_session.cdp_client.send.Input.dispatchKeyEvent(
            params=down, session_id=cdp_session.session_id
        )
        await cdp_session.cdp_client.send.Input.dispatchKeyEvent(
            params=up, session_id=cdp_session.session_id
        )
        delay = random.uniform(lo, hi)
        pause_chance = _KEYSTROKE_PAUSE_CHANCE
        if prev in ".!?":
            pause_chance = min(0.5, pause_chance * 5)
        elif prev in ",;:" or prev == "\n":
            pause_chance = min(0.3, pause_chance * 2.5)
        if random.random() < pause_chance:
            delay += random.uniform(*_KEYSTROKE_PAUSE_RANGE)
        await asyncio.sleep(delay)
        prev = ch

    # Verify the field actually holds what we intended — catches framework-level
    # truncation or dropped keystrokes; on mismatch, fall back so a later setter can
    # overwrite cleanly (the JS value-setter replaces, so partial text isn't stranded).
    actual = await _read_value()
    if not isinstance(actual, str) or _normalize_newlines(typed_text) not in _normalize_newlines(actual):
        logger.warning(
            "Keystroke typing verification failed for index %s (%d chars intended); "
            "falling back to insertText/value-set.",
            index, len(typed_text),
        )
        return None
    msg = f"Entered {len(text)} characters into element {index} (realistic keystroke typing)."
    return ActionResult(extracted_content=msg, long_term_memory=msg)


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


async def _current_field_value(browser_session, node) -> str | None:
    """Current .value of an <input>/<textarea>, or None if unreadable. Fail-open:
    any probe error returns None so typing is never blocked by the read."""
    if node is None or node.tag_name not in ("input", "textarea"):
        return None
    try:
        cdp_session = await browser_session.cdp_client_for_node(node)
        resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
            params={"backendNodeId": node.backend_node_id},
            session_id=cdp_session.session_id,
        )
        object_id = (resolved.get("object") or {}).get("objectId")
        if not object_id:
            return None
        res = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
            params={
                "objectId": object_id,
                "functionDeclaration": "function() { return this.value; }",
                "returnByValue": True,
            },
            session_id=cdp_session.session_id,
        )
        value = (res.get("result") or {}).get("value")
        return value if isinstance(value, str) else None
    except Exception:
        return None


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


# In-page visibility probe for one element. Reports the raw signals; the Python side
# (_honeypot_reason) decides. `offscreen` deliberately flags only NEGATIVE positioning
# (moved above/left of the origin, the honeypot trick) — never below-the-fold, which is
# legitimate and where real required fields routinely sit.
_JS_FIELD_VISIBILITY = """
function() {
    const el = this;
    const cs = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const leftCss = parseFloat(cs.left);
    const topCss = parseFloat(cs.top);
    const indent = parseFloat(cs.textIndent);
    return {
        displayNone: cs.display === 'none',
        visHidden: cs.visibility === 'hidden' || cs.visibility === 'collapse',
        opacity: parseFloat(cs.opacity || '1'),
        tiny: (r.width <= 1 || r.height <= 1),
        offscreen: (r.right <= 0 || r.bottom <= 0 || r.left <= -1000 || r.top <= -1000)
                   || (Math.abs(leftCss) >= 9000) || (Math.abs(topCss) >= 9000)
                   || (Math.abs(indent) >= 9000),
        type: (el.getAttribute('type') || '').toLowerCase(),
        name: (el.getAttribute('name') || el.id || '').toLowerCase(),
        ariaHidden: el.getAttribute('aria-hidden') === 'true'
                    || !!el.closest('[aria-hidden="true"]'),
        tabindex: el.getAttribute('tabindex'),
    };
}
"""


def _honeypot_reason(info: object) -> str | None:
    """Given the visibility probe, return a reason string if this field is a honeypot /
    hidden trap the agent must NOT fill, else None. Conservative: a plainly visible
    field is never blocked, even if it's named like a honeypot token (real portfolio/
    URL fields exist)."""
    if not isinstance(info, dict):
        return None
    if info.get("displayNone"):
        return "display:none"
    if info.get("visHidden"):
        return "visibility:hidden"
    if info.get("type") == "hidden":
        return "type=hidden"
    if info.get("tiny"):
        return "zero/1px size"
    if info.get("offscreen"):
        return "positioned off-screen"
    try:
        if float(info.get("opacity", 1)) <= 0.05:
            return "opacity ~0"
    except (TypeError, ValueError):
        pass
    # Visible but weakly de-emphasized AND named like a honeypot → trap.
    name = info.get("name") or ""
    weak_hidden = info.get("ariaHidden") or str(info.get("tabindex")) == "-1"
    if weak_hidden and any(tok in name for tok in _HONEYPOT_NAME_TOKENS):
        return f"honeypot-named field ('{name}') removed from tab order / a11y tree"
    return None


async def _honeypot_block_reason(browser_session, node) -> str | None:
    """Run the visibility probe on `node`; return a block reason or None. Fail-open:
    any probe error returns None so a real field is never wrongly refused."""
    if not _HONEYPOT_GUARD or node is None:
        return None
    try:
        cdp_session = await browser_session.cdp_client_for_node(node)
        resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
            params={"backendNodeId": node.backend_node_id},
            session_id=cdp_session.session_id,
        )
        object_id = (resolved.get("object") or {}).get("objectId")
        if not object_id:
            return None
        res = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
            params={
                "objectId": object_id,
                "functionDeclaration": _JS_FIELD_VISIBILITY,
                "returnByValue": True,
            },
            session_id=cdp_session.session_id,
        )
        info = (res.get("result") or {}).get("value")
        return _honeypot_reason(info)
    except Exception:
        return None


# Trace a jittered mousemove path to an element's center, then a brief settle, so a
# subsequent (browser-use) click is preceded by real pointer movement. `mouse_state`
# carries the last cursor position across clicks for a continuous path.
_JS_RECT_CENTER = """
function() {
    const r = this.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return {
        x: x, y: y, w: r.width, h: r.height, vw: vw, vh: vh,
        inView: r.width > 0 && r.height > 0 && x >= 0 && y >= 0 && x <= vw && y <= vh,
    };
}
"""

# Does viewport point (x, y) actually land on this element (or something inside/
# wrapping it)? Used before a synthetic pointer press so we never press through an
# overlay (open dropdown, toast) that happens to cover the target.
_JS_POINT_HITS_NODE = """
function(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    return el === this || this.contains(el) || el.contains(this);
}
"""


async def _rect_center(cdp_session, object_id) -> dict | None:
    res = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
        params={
            "objectId": object_id,
            "functionDeclaration": _JS_RECT_CENTER,
            "returnByValue": True,
        },
        session_id=cdp_session.session_id,
    )
    return (res.get("result") or {}).get("value") or None


async def _humanize_scroll_to_view(cdp_session, object_id, mouse_state: dict) -> bool:
    """Wheel the page toward the element until its center is inside the viewport,
    with real mouseWheel events — what a human's wheel/trackpad emits — instead of
    an instant programmatic jump. Returns True when the element ends up in view;
    False (fail-open) hands the job back to browser-use's programmatic scroll, e.g.
    when the target lives in an inner scroll container the page wheel can't reach."""
    if not _HUMANIZED_SCROLL:
        return False
    last_y = None
    for _ in range(_SCROLL_MAX_EVENTS):
        rect = await _rect_center(cdp_session, object_id)
        if not rect:
            return False
        y = float(rect.get("y") or 0)
        vh = float(rect.get("vh") or 0)
        vw = float(rect.get("vw") or 0)
        if vh <= 0 or vw <= 0:
            return False
        if rect.get("inView"):
            return True
        if last_y is not None and abs(y - last_y) < 1:
            return False  # wheel isn't moving the target — inner scroll container
        last_y = y
        # Aim the target's center at a natural reading band, one wheel burst at a time.
        target_y = vh * random.uniform(*_SCROLL_TARGET_BAND)
        delta = y - target_y
        step = max(-_SCROLL_WHEEL_STEP[1], min(_SCROLL_WHEEL_STEP[1], delta))
        if abs(step) < _SCROLL_WHEEL_STEP[0]:
            step = _SCROLL_WHEEL_STEP[0] if delta > 0 else -_SCROLL_WHEEL_STEP[0]
        # Wheel where the cursor actually is (clamped on-screen), like a real hand.
        wx = mouse_state.get("x")
        wy = mouse_state.get("y")
        if wx is None or wy is None:
            wx, wy = vw / 2, vh / 2
        wx = min(max(float(wx), 4), vw - 4) + random.uniform(-2, 2)
        wy = min(max(float(wy), 4), vh - 4) + random.uniform(-2, 2)
        try:
            await cdp_session.cdp_client.send.Input.dispatchMouseEvent(
                params={
                    "type": "mouseWheel",
                    "x": wx,
                    "y": wy,
                    "deltaX": 0,
                    "deltaY": step,
                    "button": "none",
                },
                session_id=cdp_session.session_id,
            )
        except Exception:
            return False
        await asyncio.sleep(random.uniform(*_SCROLL_STEP_DELAY))
    return False


async def _humanize_pointer_to_index(browser_session, index, mouse_state: dict):
    """Move the virtual cursor to element `index`'s center along a short jittered
    path, wheel-scrolling the element into view first when it's off-screen.

    Best-effort and press-free: it emits mouseWheel/mouseMoved events only, so the
    real click is still browser-use's trusted CDP click. Returns (cdp_session, x, y)
    with the cursor's final position when it arrived on the element, or None when it
    couldn't (element unresolvable, or still out of view after scrolling — then
    browser-use's own scroll+click takes over and the coordinates here would be
    wrong anyway)."""
    if index is None:
        return None
    node = await browser_session.get_dom_element_by_index(index)
    if node is None:
        return None
    cdp_session = await browser_session.cdp_client_for_node(node)
    resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
        params={"backendNodeId": node.backend_node_id},
        session_id=cdp_session.session_id,
    )
    object_id = (resolved.get("object") or {}).get("objectId")
    if not object_id:
        return None
    rect = await _rect_center(cdp_session, object_id)
    if not rect:
        return None
    if not rect.get("inView"):
        # Real users scroll a control into view before pointing at it.
        if not await _humanize_scroll_to_view(cdp_session, object_id, mouse_state):
            return None
        rect = await _rect_center(cdp_session, object_id)
        if not rect or not rect.get("inView"):
            return None
    tx = float(rect["x"]) + random.uniform(-min(6, rect.get("w", 12) / 4), min(6, rect.get("w", 12) / 4))
    ty = float(rect["y"]) + random.uniform(-min(4, rect.get("h", 8) / 4), min(4, rect.get("h", 8) / 4))
    sx = mouse_state.get("x")
    sy = mouse_state.get("y")
    if sx is None or sy is None:
        # First move of the run: start from a plausible resting spot, not the target.
        sx, sy = tx * 0.5, ty * 0.5
    steps = random.randint(*_CLICK_MOVE_STEPS)
    for i in range(1, steps + 1):
        t = i / steps
        # Ease-in-out so the path accelerates then settles, with small lateral jitter.
        ease = t * t * (3 - 2 * t)
        jitter = 0 if i == steps else random.uniform(-3, 3)
        mx = sx + (tx - sx) * ease + jitter
        my = sy + (ty - sy) * ease + jitter
        try:
            await cdp_session.cdp_client.send.Input.dispatchMouseEvent(
                params={"type": "mouseMoved", "x": mx, "y": my, "button": "none"},
                session_id=cdp_session.session_id,
            )
        except Exception:
            return None  # movement is optional — bail quietly, let the click proceed
        await asyncio.sleep(random.uniform(*_CLICK_MOVE_STEP_DELAY))
    mouse_state["x"], mouse_state["y"] = tx, ty
    await asyncio.sleep(random.uniform(*_CLICK_PRE_PRESS_DWELL))
    return cdp_session, tx, ty


# Input types where a pointer press is NOT how a human focuses them before typing
# (toggles fire on click; file/range/etc. aren't typed into at all).
_NON_POINTER_FOCUS_TYPES = {
    "checkbox", "radio", "file", "range", "color", "button", "submit", "reset",
    "image", "hidden",
}


def _is_pointer_focusable(node) -> bool:
    """Is this a plain typeable field a human would click into before typing?"""
    if node is None or node.tag_name not in ("input", "textarea"):
        return False
    if node.tag_name == "textarea":
        return True
    input_type = ((node.attributes or {}).get("type") or "text").lower()
    return input_type not in _NON_POINTER_FOCUS_TYPES


async def _pointer_click_focus(browser_session, index, mouse_state: dict) -> None:
    """Click into a text field the way a person does before typing: scroll it into
    view, move the cursor onto it, and press — so focus arrives via a real pointer
    interaction instead of a bare DOM.focus (fields that start receiving keystrokes
    with no preceding pointer approach are an automation artifact; browser-use's
    typing path focuses with DOM.focus and only clicks as a fallback). Best-effort:
    on any failure the typing paths still DOM.focus as before."""
    arrived = await _humanize_pointer_to_index(browser_session, index, mouse_state)
    if arrived is None:
        return
    cdp_session, x, y = arrived
    node = await browser_session.get_dom_element_by_index(index)
    if node is None:
        return
    resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
        params={"backendNodeId": node.backend_node_id},
        session_id=cdp_session.session_id,
    )
    object_id = (resolved.get("object") or {}).get("objectId")
    if not object_id:
        return
    res = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
        params={
            "objectId": object_id,
            "functionDeclaration": _JS_POINT_HITS_NODE,
            "arguments": [{"value": x}, {"value": y}],
            "returnByValue": True,
        },
        session_id=cdp_session.session_id,
    )
    if not (res.get("result") or {}).get("value"):
        return  # something overlays the field at that point — don't press through it
    base = {"x": x, "y": y, "button": "left", "clickCount": 1}
    await cdp_session.cdp_client.send.Input.dispatchMouseEvent(
        params={**base, "type": "mousePressed"}, session_id=cdp_session.session_id
    )
    await asyncio.sleep(random.uniform(0.03, 0.09))
    await cdp_session.cdp_client.send.Input.dispatchMouseEvent(
        params={**base, "type": "mouseReleased"}, session_id=cdp_session.session_id
    )
    await asyncio.sleep(random.uniform(0.08, 0.2))


# OTP exemption for the navigate guard: the browser_use engine's verification-code
# relay is the in-process `request_verification_code` tool (it polls Redis, never
# the browser), so OTP polling can't trip the guard — but the hosted engine's
# %codeUrl% contract navigates to /apply-code/{token} and /apply-control/{token}
# repeatedly. Exempt those paths as defense-in-depth so the guard stays safe even
# if a future task prompt hands this engine a code URL.
_NAVIGATE_GUARD_EXEMPT_PATHS = ("/apply-code/", "/apply-control/")


def _urls_equal_ignoring_fragment(a: str, b: str) -> bool:
    return a.split("#", 1)[0].rstrip("/") == b.split("#", 1)[0].rstrip("/")


def _install_navigate_guard(tools: Tools) -> None:
    """
    Override `navigate` to reject the three degenerate forms that wasted 8 of the
    9 broken steps in the 2026-07-09 Docugami run, returning an INSTRUCTIVE error
    the model sees on its next step (an error result is corrective feedback and
    counts toward max_failures; a silent no-op "success" resets it):

    - javascript: URLs — blocked by the SecurityWatchdog anyway, but its block
      path force-navigates to about:blank and destroys form state.
    - about:blank — wipes the loaded form and every filled field.
    - same-URL (fragment-insensitive) re-navigation — a no-op on Greenhouse-style
      SPAs that the agent mistakes for scrolling/progress.

    /apply-code/ and /apply-control/ URLs are always allowed (OTP/stop-all
    contract — see _NAVIGATE_GUARD_EXEMPT_PATHS).
    """
    registry = tools.registry.registry
    original = registry.actions.get("navigate")
    if original is None:
        return
    original_fn = original.function
    param_model = original.param_model
    description = original.description

    @tools.registry.action(description, param_model=param_model, terminates_sequence=True)
    async def navigate(params, browser_session):  # noqa: A001 - overrides the built-in action
        url = (params.url or "").strip()
        lowered = url.lower()
        if lowered.startswith("javascript:"):
            return ActionResult(
                error=(
                    "Navigation to javascript: URLs is blocked by security policy and "
                    "would reset the page to about:blank, losing all progress. To fill "
                    "a field, use the input action with the element's index from the "
                    "browser state. To click, use the click action with the index."
                )
            )
        if lowered.startswith("about:"):
            return ActionResult(
                error=(
                    "Navigating to about:blank would destroy the loaded application "
                    "form and all filled fields. Stay on the current page and interact "
                    "with elements by their index (click/input) instead."
                )
            )
        if not any(path in url for path in _NAVIGATE_GUARD_EXEMPT_PATHS):
            current = None
            try:
                current = await browser_session.get_current_page_url()
            except Exception:
                pass  # fail-open: never block navigation because state read failed
            if current and _urls_equal_ignoring_fragment(current, url):
                return ActionResult(
                    error=(
                        f"You are ALREADY on {current} — re-navigating to the same page "
                        "(or its #fragment) does nothing and wastes a step. Every "
                        "interactive element listed in the browser state is actionable "
                        "by its index RIGHT NOW, even elements below the visible "
                        "screenshot area — you do not need to scroll or navigate to "
                        "reach them. Use input/click with the element index to fill "
                        "the form."
                    )
                )
        return await original_fn(params=params, browser_session=browser_session)


def _install_realistic_click(tools: Tools, mouse_state: dict) -> None:
    """
    Override `click` to precede the real click with human-like pointer movement,
    wheel-scrolling off-screen targets into view first.

    We trace a short jittered mousemove path to the target's center (see
    _humanize_pointer_to_index), then delegate to browser-use's own click for the
    actual press/release — which already uses trusted CDP mouse events and handles
    scroll-into-view, new-tab, <select>, and download edge cases. So the net effect is
    a full (wheel scroll →) mousemove → (trusted) mousedown → mouseup sequence per
    click, removing the "click with zero preceding pointer motion" and "click on an
    element that was never scrolled to" behavioral tells, without reimplementing
    browser-use's click robustness. Movement is best-effort: any failure falls straight
    through to the normal click. The cursor position lives in the shared `mouse_state`
    so the path is continuous across clicks AND typing focus clicks.
    """
    registry = tools.registry.registry
    original = registry.actions.get("click")
    if original is None:
        return
    original_fn = original.function
    param_model = original.param_model
    description = original.description

    @tools.registry.action(description, param_model=param_model)
    async def click(params, browser_session):  # noqa: A001 - overrides built-in
        if _HUMANIZED_CLICK:
            try:
                await _humanize_pointer_to_index(
                    browser_session, getattr(params, "index", None), mouse_state
                )
            except Exception:
                pass  # never let movement block a real click
        return await original_fn(params=params, browser_session=browser_session)


def _build_apply_tools(
    application_id: str | None = None,
    *,
    control_token: str | None = None,
    on_gate=None,
    fetch_code=None,
    on_code=None,
    bb_session_id: str | None = None,
) -> Tools:
    """
    Build a browser-use Tools registry with three hardened overrides and two additions:

    - `input` enters long free-text answers (essays/cover letters) as a genuine
      per-character CDP keystroke stream (keydown/char/keyup with human-like timing —
      see _type_long_text_keystrokes), falling back to trusted word-chunk insertText
      then a JS value-set. This is a tool-level guarantee: realistic typing happens in
      the tool regardless of model/provider, so the prompt no longer has to ask for it.
      It bypasses browser-use's own char-by-char path, which is slow over a remote link
      and deadlocks its event bus mid-type. Short values (incl. autocomplete fields,
      which need real keystrokes) keep the built-in typing path. The `input` override
      also refuses to type into honeypot fields (hidden/off-screen/a11y-removed inputs
      a human never sees — see _honeypot_block_reason), and focuses typeable fields
      with a real scroll+point+click before any keystrokes (see _pointer_click_focus).
    - `click` is preceded by human-like wheel-scrolling into view and pointer movement
      to the target before the real (trusted) click fires (see _install_realistic_click).
    - `upload_file` is replaced with a remote-safe implementation that injects the
      file's bytes in-page instead of sending a local path over CDP
      (see _install_robust_upload / _attach_resume_bytes).
    - `navigate` rejects javascript:/about:blank/same-URL navigation with an
      instructive error (see _install_navigate_guard).
    - `request_verification_code` relays an emailed ATS code mid-run — the code is
      read from the Redis mailbox, written there by the AgentMail relay webhook or a
      manual paste (see _install_verification_relay).
    - `pre_submit_check` is the Stop-All submit-boundary control (see
      _install_pre_submit_check); registered only when there is a token/app to check.
    """
    # `evaluate` (raw in-page JavaScript) is excluded outright: it lets the model
    # bulk-fill fields with el.value assignments + synthetic dispatchEvent — events
    # whose isTrusted=false is the loudest bot signal an Ashby/Fingerprint-class
    # detector can see, and it bypasses every humanization guarantee below (the
    # 2026-07-14 Tessera run did exactly this on step 4 and was spam-flagged).
    # Nothing in the apply flow needs model-driven JS; Scout's own CDP helpers are
    # unaffected.
    tools = Tools(exclude_actions=["evaluate"])
    registry = tools.registry.registry
    original = registry.actions.get("input")
    if original is None:
        return tools
    original_fn = original.function
    param_model = original.param_model
    description = original.description
    # One cursor position shared by clicks and typing-focus clicks, so the pointer
    # traces one continuous path across the whole run.
    mouse_state: dict = {"x": None, "y": None}

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

        # Honeypot guard: refuse to type into a field a human could never see. Filling a
        # CSS-hidden / off-screen / a11y-removed input is a guaranteed spam-bot verdict,
        # so this is a hard skip regardless of what the model requested.
        honeypot = await _honeypot_block_reason(browser_session, node)
        if honeypot is not None:
            logger.info("Honeypot guard: refused input into index %s (%s).", index, honeypot)
            return ActionResult(
                error=(
                    "This field is hidden from human users (a spam-trap / honeypot) and "
                    "must be left EMPTY — filling it would flag the application as a bot. "
                    "Skip it and continue with the visible required fields."
                )
            )

        # Idempotency guard: retyping a value the field already holds is wasted steps
        # AND a bot-like habit — clear + re-type the identical string is telemetry no
        # human produces (the 2026-07-14 Ashby run typed the same portfolio URL twice
        # in consecutive steps). Report success without touching the field.
        current_value = await _current_field_value(browser_session, node)
        if current_value is not None and current_value.strip() == text.strip() and text.strip():
            msg = (
                f"Element {index} ALREADY contains exactly that value — nothing was "
                "retyped. The field is done; move on to the next empty field."
            )
            return ActionResult(extracted_content=msg, long_term_memory=msg)

        # Real users click into a field before typing. Scroll it into view (wheel
        # events), move the pointer onto it, and focus it with a real click before any
        # keystrokes — bare DOM.focus with no pointer approach is an automation
        # artifact. Best-effort: on failure the typing paths below still DOM.focus.
        if _HUMANIZED_CLICK and _is_pointer_focusable(node):
            try:
                await _pointer_click_focus(browser_session, index, mouse_state)
            except Exception:
                pass  # never let focus realism block the actual typing

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

        # Long free-text entry ladder, each falling through to the next on failure:
        #   1. _type_long_text_keystrokes — genuine per-character key events (keydown/
        #      char/keyup) with human-like timing. PRIMARY path: it's the only one that
        #      emits a real keystroke stream, removing the "field filled with zero key
        #      events" behavioral tell that Ashby-class spam scoring flags.
        #   2. _set_long_text_trusted — humanized word-chunk insertText (isTrusted=true
        #      input events, but no key events). Fallback for text over the keystroke
        #      char cap, or when per-char typing didn't verify.
        #   3. _set_long_text_via_js — synthetic value-setter (isTrusted=false). Last
        #      resort; replaces the value outright so partial text is never stranded.
        # All three avoid the slow/deadlock-prone char-by-char path in browser-use's own
        # event bus by calling CDP directly.
        if len(text) > _LONG_TEXT_THRESHOLD:
            for setter in (
                _type_long_text_keystrokes,
                _set_long_text_trusted,
                _set_long_text_via_js,
            ):
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

    _install_navigate_guard(tools)
    _install_realistic_click(tools, mouse_state)
    upload_state = _install_robust_upload(tools, bb_session_id)
    _install_verification_relay(
        tools, application_id, on_gate=on_gate, fetch_code=fetch_code, on_code=on_code
    )
    if application_id or control_token:
        _install_pre_submit_check(
            tools, application_id, control_token, upload_state=upload_state
        )
    _install_post_submit_check(
        tools, upload_state=upload_state, application_id=application_id
    )
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
    submit time. This tool preserves the poll-gate contract of routes/apply_code.py
    exactly, minus the HTTP hop and tab juggling:

    - The FIRST call stamps apply:gate:{app_id} (SET NX — the same key the
      /apply-code route writes), then fires on_gate(gate_ts) — the task's status
      flip to awaiting_code (which the AgentMail webhook's OTP matcher keys on).
      OTP handling is fully agent-side: NO user notification, NO CODE NEEDED card —
      verification codes are Scout's problem, never the user's.
    - The poll loop then reads the Redis mailbox apply:code:{app_id} every ~3s
      (written by the AgentMail relay webhook) AND the shared parked-OTP slot
      apply:ghotp:parked — Greenhouse's code email routinely arrives BEFORE this
      gate is stamped, in which case the webhook parked it (see
      core/agentmail_inbox.py). The manual /verification-code endpoint still writes
      the same mailbox and keeps working as a dormant escape hatch.
    - A fetch_code(gate_ts) callback is also polled (~every 15s) when provided —
      tasks/job_tasks.py wires agentmail_inbox.fetch_code_from_inbox, which reads
      the shared inbox over the AgentMail REST API. This pull path is what serves
      the code when the webhook cannot reach this worker (local dev) or is down.

    The code is consumed on read and never persisted. One call waits ~2 minutes; the
    prompt allows up to 3 calls before the agent gives up and reports the timeout.
    """
    call_count = {"n": 0}
    state: dict = {"gate_ts": None, "last_fetch": 0.0}

    verification_desc = (
        "Retrieve an emailed verification/security code via Scout's email relay. Use "
        "ONLY when the page says a code was emailed to the applicant (e.g. 'enter the "
        "code sent to your email to confirm you are human'). Optionally pass sent_to "
        "(the email address shown) and code_length (number of characters expected). "
        "Waits up to 2 minutes for the relay to deliver the code; returns the code if "
        f"retrieved. May be called up to {_VERIFICATION_MAX_CALLS} times total to "
        "keep waiting."
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
                    if raw is not None:
                        state["gate_ts"] = float(str(raw))
            except Exception:
                pass  # gate marker is observability; the relay still works without it

            def _mark_awaiting():
                # awaiting_code is an INTERNAL state: the AgentMail webhook's OTP
                # matcher keys on it. It must never surface to the user as a code
                # prompt — no notification, neutral status text only.
                if on_gate:
                    on_gate(state["gate_ts"])
                    return
                supabase.table("applications").update(
                    {
                        "status": "awaiting_code",
                        "error_message": "Completing the site's email verification step…",
                    }
                ).eq("id", application_id).execute()

            try:
                await asyncio.to_thread(_mark_awaiting)
            except Exception:
                logger.warning("awaiting-code gate callback failed", exc_info=True)

        logger.info(
            "Awaiting verification code for application %s (attempt %s/%s, "
            "sent_to=%s, code_length=%s)",
            application_id, attempt, _VERIFICATION_MAX_CALLS,
            params.sent_to, params.code_length,
        )

        def _claim_parked_code() -> str | None:
            """Claim a Greenhouse OTP the webhook parked BEFORE this gate was
            stamped (the code email routinely beats the agent's first poll —
            see core/agentmail_inbox.py). One shared slot is safe: the
            shared-inbox verify mutex allows at most one Greenhouse apply
            platform-wide at the code stage. Freshness: the embedded timestamp
            must fall within the parking TTL window of this gate."""
            raw = redis_client.get(pending_otp_key())
            if raw is None:
                return None
            try:
                parked = json.loads(str(raw))
                parked_code = str(parked.get("code") or "").strip()
                parked_ts = float(parked.get("ts") or 0)
            except (ValueError, TypeError):
                redis_client.delete(pending_otp_key())
                return None
            if not parked_code or abs(state["gate_ts"] - parked_ts) > PENDING_OTP_TTL:
                return None
            redis_client.delete(pending_otp_key())
            logger.info(
                "Claimed parked verification code for application %s "
                "(parked %.0fs before/after gate)",
                application_id, state["gate_ts"] - parked_ts,
            )
            return parked_code

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
            try:
                parked_value = await asyncio.to_thread(_claim_parked_code)
            except Exception:  # noqa: BLE001
                parked_value = None  # Redis blip — the mailbox poll stays live
            if parked_value:
                code = parked_value
                code_was_auto = True
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
            # Pull-source hook: one fetch_code attempt every ~15s for as long as
            # the relay is polling (the loop is already hard-bounded by the per-call
            # deadline and the call budget, so no extra time window applies). A
            # fetched code is used directly (no mailbox round-trip); the mailbox
            # poll (push + manual) stays live in parallel.
            if (
                fetch_code
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
                f"No code yet (attempt {attempt} of {_VERIFICATION_MAX_CALLS}). The "
                "email relay is still watching for it. Call request_verification_code "
                "again to keep waiting."
            )
        )


class _PreSubmitCheckAction(BaseModel):
    """No params — the control token / application id are bound at registration."""


class _PostSubmitCheckAction(BaseModel):
    """No params — classifies the page after Submit from visible DOM evidence."""


async def _cdp_evaluate_json(browser_session, expression: str) -> object | None:
    """Evaluate a JS expression on the focused page and return the JSON value."""
    cdp_session = await browser_session.get_or_create_cdp_session()
    result = await cdp_session.cdp_client.send.Runtime.evaluate(
        params={"expression": expression, "returnByValue": True, "awaitPromise": True},
        session_id=cdp_session.session_id,
    )
    return (result.get("result") or {}).get("value")


async def _scan_required_fields(browser_session) -> dict | None:
    """Run the required-field inventory scanner. Fail-open: returns None on CDP error."""
    try:
        value = await _cdp_evaluate_json(browser_session, _JS_SCAN_REQUIRED_FIELDS)
        return value if isinstance(value, dict) else None
    except Exception:
        logger.debug("required-field scan failed", exc_info=True)
        return None


async def _classify_post_submit_page(browser_session) -> dict:
    """Classify the page after submit. Fail-open to unconfirmed on CDP error."""
    try:
        value = await _cdp_evaluate_json(browser_session, _JS_CLASSIFY_POST_SUBMIT)
        return classify_post_submit_payload(value if isinstance(value, dict) else None)
    except Exception:
        logger.debug("post-submit classify failed", exc_info=True)
        return classify_post_submit_payload(None)


async def _probe_fingerprint(browser_session) -> dict | None:
    """Capture a redacted browser fingerprint snapshot (no PII)."""
    try:
        value = await _cdp_evaluate_json(browser_session, _JS_FINGERPRINT_PROBE)
        return value if isinstance(value, dict) else None
    except Exception:
        logger.debug("fingerprint probe failed", exc_info=True)
        return None


def _install_pre_submit_check(
    tools: Tools,
    application_id: str | None,
    control_token: str | None,
    *,
    upload_state: dict | None = None,
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

    Also runs a deterministic required-field inventory (native required, aria-required,
    file, select, radio/checkbox groups, comboboxes) with a fixed-point rescan so
    async combobox commits cannot slip past as satisfied.
    """
    if upload_state is not None:
        upload_state.setdefault(
            "submit",
            {
                "inventory_generation": 0,
                "last_inventory_hash": None,
                "last_inventory": None,
                "pre_submit_calls": 0,
                "stable_rounds": 0,
            },
        )

    desc = (
        "Check whether this application is still authorized to be submitted AND whether "
        "all visible required fields (including resume upload) are complete. Call this "
        "exactly once when you believe the form is ready, immediately before clicking "
        "the final Submit/Apply button. If it returns BLOCKED or CANCEL, do not submit."
    )

    @tools.registry.action(desc, param_model=_PreSubmitCheckAction)
    async def pre_submit_check(params, browser_session):
        _ = params
        submit_state = None
        if isinstance(upload_state, dict):
            submit_state = upload_state.setdefault(
                "submit",
                {
                    "inventory_generation": 0,
                    "last_inventory_hash": None,
                    "last_inventory": None,
                    "pre_submit_calls": 0,
                    "stable_rounds": 0,
                },
            )
            submit_state["pre_submit_calls"] = int(submit_state.get("pre_submit_calls") or 0) + 1
            if submit_state["pre_submit_calls"] > _PRE_SUBMIT_MAX_CALLS:
                return ActionResult(
                    error=(
                        "BLOCKED — too many pre_submit_check calls without a valid submit. "
                        "Call done now reporting the form is incomplete "
                        "(include the words 'required fields incomplete')."
                    )
                )

        # Hard gate, not a prompt suggestion. Once this run has uploaded files, use
        # their attempt-scoped trackers so a stale toast from an earlier failed try
        # cannot poison a later successful retry. If no upload action ran, preserve
        # the legacy visible-error safety check.
        rejection = await _current_upload_blocker(browser_session, upload_state)
        if rejection is not None:
            logger.info(
                "pre_submit_check: visible upload error blocks submit for application %s: %s",
                application_id,
                rejection,
            )
            _emit_apply_telemetry(
                "apply.pre_submit.blocked",
                {"reason": "upload_error"},
                application_id=application_id,
                level="warning",
            )
            return ActionResult(
                error=(
                    f'The page shows a file-upload error: "{rejection}". Do NOT click '
                    "Submit — the site rejected an uploaded file and the submission "
                    "would be refused. If you have already retried that upload once, "
                    "call done now and report the failure (include the words 'resume "
                    "upload failed'); otherwise retry the upload_file action once, "
                    "then call pre_submit_check again."
                )
            )

        # Deterministic required-field gate. Fail-open on CDP errors so a probe
        # outage cannot block every submit on healthy forms.
        stable_rounds = 0
        report: dict | None = None
        while True:
            report = await _scan_required_fields(browser_session)
            if report is None:
                logger.info(
                    "pre_submit_check: required-field scan unavailable — fail-open for app %s",
                    application_id,
                )
                break

            unsatisfied = evaluate_required_inventory(report, upload_state)
            _emit_apply_telemetry(
                "apply.pre_submit.inventory",
                inventory_telemetry_summary(report, unsatisfied),
                application_id=application_id,
            )
            if unsatisfied:
                if submit_state is not None:
                    submit_state["stable_rounds"] = 0
                    submit_state["last_inventory_hash"] = None
                    submit_state["last_inventory"] = {
                        "summary": report.get("summary"),
                        "unsatisfied_labels": inventory_telemetry_summary(
                            report, unsatisfied
                        ).get("labels_redacted"),
                    }
                _emit_apply_telemetry(
                    "apply.pre_submit.blocked",
                    {
                        "reason": "required_fields",
                        "count": len(unsatisfied),
                        "labels_redacted": inventory_telemetry_summary(
                            report, unsatisfied
                        ).get("labels_redacted"),
                    },
                    application_id=application_id,
                    level="warning",
                )
                return ActionResult(error=required_field_blocker_message(unsatisfied))

            inv_hash = hash_inventory(report)
            if submit_state is not None:
                submit_state["inventory_generation"] = int(
                    submit_state.get("inventory_generation") or 0
                ) + 1
                if inv_hash == submit_state.get("last_inventory_hash"):
                    stable_rounds = int(submit_state.get("stable_rounds") or 0) + 1
                else:
                    stable_rounds = 0
                submit_state["last_inventory_hash"] = inv_hash
                submit_state["stable_rounds"] = stable_rounds
                submit_state["last_inventory"] = {"summary": report.get("summary")}
            else:
                stable_rounds += 1

            if stable_rounds >= _PRE_SUBMIT_FIXED_POINT_ROUNDS:
                _emit_apply_telemetry(
                    "apply.pre_submit.fixed_point",
                    {"rounds": stable_rounds, "hash": inv_hash},
                    application_id=application_id,
                )
                break

            await asyncio.sleep(_PRE_SUBMIT_SETTLE_SECONDS)

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
        # Human "final read" pause so submission is never instantaneous — a form that
        # completes and submits in ~1-2s is a classic too-fast automation tell. This
        # gate is the guaranteed choke point right before the Submit click, so the
        # dwell lives here rather than relying on the model to wait.
        if _SUBMIT_DWELL:
            await asyncio.sleep(random.uniform(*_SUBMIT_DWELL_RANGE))
        msg = "OK — proceed with the final submit."
        return ActionResult(extracted_content=msg, long_term_memory=msg)


def _install_post_submit_check(
    tools: Tools,
    *,
    upload_state: dict | None = None,
    application_id: str | None = None,
) -> None:
    """Register `post_submit_check`: classify the page after clicking Submit."""

    desc = (
        "After clicking the final Submit/Apply button, call this once to classify "
        "the outcome from the visible page (confirmed, spam block, CAPTCHA, "
        "verification gate, validation errors, still on form, or unconfirmed). "
        "Use the classification in your done message. Do NOT resubmit on spam."
    )

    @tools.registry.action(desc, param_model=_PostSubmitCheckAction)
    async def post_submit_check(params, browser_session):
        _ = params
        verdict = await _classify_post_submit_page(browser_session)
        if isinstance(upload_state, dict):
            upload_state.setdefault("submit", {})["post_submit_verdict"] = verdict
        _emit_apply_telemetry(
            "apply.post_submit.verdict",
            {
                "classification": verdict.get("classification"),
                "confidence": verdict.get("confidence"),
                "evidence": verdict.get("evidence") or [],
            },
            application_id=application_id,
            level="warning"
            if verdict.get("classification") in {"spam_blocked", "captcha"}
            else "info",
        )
        classification = verdict.get("classification") or "unconfirmed"
        evidence = "; ".join(verdict.get("evidence") or []) or "(no snippet)"
        guidance = {
            "confirmed": (
                "CONFIRMED — call done reporting success and quote the confirmation evidence."
            ),
            "spam_blocked": (
                "SPAM BLOCKED — do NOT click Submit again and do NOT wait-and-resubmit. "
                "Call done immediately reporting the spam block (include the words "
                "'possible spam')."
            ),
            "captcha": (
                "CAPTCHA — call done reporting captcha (include the word 'captcha')."
            ),
            "verification_gate": (
                "VERIFICATION GATE — use request_verification_code if available, else "
                "call done reporting verification code was not provided."
            ),
            "validation_errors": (
                "VALIDATION ERRORS still on the form — fix the visible field errors, "
                "then call pre_submit_check again before any further submit."
            ),
            "still_on_form": (
                "STILL ON FORM — submission was not confirmed. Do not keep clicking "
                "Submit. Call done reporting submission unconfirmed unless you can "
                "fix a clear validation error first."
            ),
            "unconfirmed": (
                "UNCONFIRMED — call done reporting that submission could not be confirmed."
            ),
        }.get(classification, "UNCONFIRMED — call done with the observed page state.")
        msg = (
            f"post_submit_check classification={classification} "
            f"confidence={verdict.get('confidence')} evidence={evidence}. {guidance}"
        )
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
    if (
        attached.get("count") == 1
        and attached.get("name") == os.path.basename(path)
        and attached.get("size") == len(data)
    ):
        msg = (
            f"Attached resume as '{attached.get('name')}' ({attached.get('size')} bytes). "
            f"The form should now show '{attached.get('name')}' — verify it does before submitting."
        )
        return ActionResult(extracted_content=msg, long_term_memory=msg)
    return ActionResult(
        error=f"Resume upload failed: file injection did not stick (input reports {attached})."
    )


_JS_READ_ATTACHED = """
function() {
    const f = this.files && this.files[0];
    return { count: this.files ? this.files.length : 0, name: f ? f.name : '', size: f ? f.size : 0 };
}
"""

_JS_CREATE_FILE_PROBE = """
(() => {
    const input = document.createElement('input');
    input.type = 'file';
    return input;
})()
"""


async def _read_attached_file(browser_session, node) -> dict:
    """{count, name, size} the file input currently holds; {} on probe failure."""
    try:
        cdp_session = await browser_session.cdp_client_for_node(node)
        resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
            params={"backendNodeId": node.backend_node_id},
            session_id=cdp_session.session_id,
        )
        object_id = (resolved.get("object") or {}).get("objectId")
        if not object_id:
            return {}
        result = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
            params={
                "objectId": object_id,
                "functionDeclaration": _JS_READ_ATTACHED,
                "returnByValue": True,
            },
            session_id=cdp_session.session_id,
        )
        return (result.get("result") or {}).get("value") or {}
    except Exception:
        return {}


async def _wait_for_remote_file(
    cdp_session,
    remote_path: str,
    *,
    expected_name: str,
    expected_size: int,
) -> tuple[bool, dict]:
    """Probe Browserbase's remote file on a detached input.

    The Session Uploads API can return before `/tmp/.uploads/<name>` has its final
    bytes. A detached input has no page listeners, so repeated probes cannot start an
    ATS upload or dispatch application-visible change events.
    """
    probe = await cdp_session.cdp_client.send.Runtime.evaluate(
        params={"expression": _JS_CREATE_FILE_PROBE, "returnByValue": False},
        session_id=cdp_session.session_id,
    )
    object_id = (probe.get("result") or {}).get("objectId")
    if not object_id:
        return False, {}
    last: dict = {}
    try:
        described = await cdp_session.cdp_client.send.DOM.describeNode(
            params={"objectId": object_id},
            session_id=cdp_session.session_id,
        )
        backend_node_id = ((described.get("node") or {}).get("backendNodeId"))
        if not backend_node_id:
            return False, {}

        deadline = time.monotonic() + _REMOTE_FILE_READY_TIMEOUT
        while time.monotonic() < deadline:
            try:
                await cdp_session.cdp_client.send.DOM.setFileInputFiles(
                    params={
                        "files": [remote_path],
                        "backendNodeId": backend_node_id,
                    },
                    session_id=cdp_session.session_id,
                )
                read = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
                    params={
                        "objectId": object_id,
                        "functionDeclaration": _JS_READ_ATTACHED,
                        "returnByValue": True,
                    },
                    session_id=cdp_session.session_id,
                )
                last = (read.get("result") or {}).get("value") or {}
            except Exception as exc:
                # A not-yet-created remote path may be rejected instead of yielding
                # a zero-byte File. Keep probing until the bounded readiness deadline.
                last = {"probe_error": str(exc)}
            if (
                last.get("count") == 1
                and last.get("name") == expected_name
                and last.get("size") == expected_size
            ):
                return True, last
            await asyncio.sleep(_REMOTE_FILE_READY_POLL)
        return False, last
    finally:
        try:
            await cdp_session.cdp_client.send.Runtime.releaseObject(
                params={"objectId": object_id},
                session_id=cdp_session.session_id,
            )
        except Exception:
            pass


async def _attach_file_native(
    browser_session,
    node,
    path: str,
    bb_session_id: str,
    staged_uploads: dict[str, dict],
):
    """
    Attach `path` the browser-NATIVE way: upload the bytes to the Browserbase
    session's filesystem (they land at /tmp/.uploads/<basename> in the remote
    browser), then point CDP DOM.setFileInputFiles at that remote path. Chrome
    itself then populates the input and fires the input/change events — trusted,
    exactly like a human using the file picker. No synthetic dispatch anywhere.

    Returns an ActionResult on VERIFIED success, or None so the caller falls back
    to _attach_resume_bytes (session-upload API failure, setFileInputFiles failure,
    or a phantom attach — Chrome accepts a nonexistent path silently, so success is
    only claimed when the input reports exactly one file of the expected size).
    """
    with open(path, "rb") as fh:
        data = fh.read()
    if not data:
        return None
    basename = os.path.basename(path)
    remote_path = f"/tmp/.uploads/{basename}"
    digest = hashlib.sha256(data).hexdigest()
    staged = staged_uploads.get(remote_path)
    if staged and staged.get("sha256") != digest:
        logger.warning(
            "Browserbase upload basename collision for %s; preserving the staged "
            "file and falling back to byte injection.",
            basename,
        )
        return None
    if staged is None:
        try:
            await asyncio.to_thread(
                lambda: get_browserbase_client().sessions.uploads.create(
                    bb_session_id, file=(basename, data)
                )
            )
        except Exception as exc:
            logger.warning(
                "Browserbase session upload failed for %s (%d bytes): %s; "
                "falling back to in-page byte injection.",
                basename,
                len(data),
                exc,
            )
            return None
        staged = {"sha256": digest, "size": len(data), "remote_path": remote_path}
        staged_uploads[remote_path] = staged
        logger.info(
            "Staged Browserbase upload once: %s (%d bytes, session=%s).",
            basename,
            len(data),
            bb_session_id,
        )
    else:
        logger.info(
            "Reusing staged Browserbase upload: %s (%d bytes, session=%s).",
            basename,
            len(data),
            bb_session_id,
        )

    try:
        cdp_session = await browser_session.cdp_client_for_node(node)
        ready_started = time.monotonic()
        ready, remote_file = await _wait_for_remote_file(
            cdp_session,
            remote_path,
            expected_name=basename,
            expected_size=len(data),
        )
        if not ready:
            logger.warning(
                "Browserbase remote upload was not ready after %.2fs "
                "(expected %s/%d, probe=%s); falling back to byte injection.",
                time.monotonic() - ready_started,
                basename,
                len(data),
                remote_file,
            )
            return None
        logger.info(
            "Browserbase remote upload ready in %.2fs: %s (%d bytes).",
            time.monotonic() - ready_started,
            basename,
            len(data),
        )
        await cdp_session.cdp_client.send.DOM.setFileInputFiles(
            params={
                "files": [remote_path],
                "backendNodeId": node.backend_node_id,
            },
            session_id=cdp_session.session_id,
        )
    except Exception as exc:
        logger.warning(
            "Native DOM.setFileInputFiles failed (%s); falling back to in-page byte injection.",
            exc,
        )
        return None
    attached = await _read_attached_file(browser_session, node)
    if (
        attached.get("count") == 1
        and attached.get("name") == basename
        and attached.get("size") == len(data)
    ):
        msg = (
            f"Attached '{attached.get('name')}' ({attached.get('size')} bytes) via the "
            f"browser-native file path. The form should now show '{attached.get('name')}' "
            "— verify it does before submitting."
        )
        logger.info("Native trusted upload attached %s (%d bytes).", basename, len(data))
        return ActionResult(extracted_content=msg, long_term_memory=msg)
    logger.warning(
        "Native upload attach did not verify (input reports %s); falling back to byte injection.",
        attached,
    )
    return None


# Attempt-scoped upload observer. Existing alerts are captured as a baseline. Only a
# newly inserted alert (NOT a mutated baseline toast) is a rejection — stale Ashby
# "failed to upload" toasts must not poison retries. Network confirmation requires a
# same-origin setFormValueToFile-style 2xx; a Delete/Remove control alone is NOT
# acceptance (Ashby shows that before the S3 POST finishes / fails).
_JS_START_UPLOAD_ATTEMPT = """
function(token, expectedName, expectedSize) {
    const selector = '[role="alert"], [role="status"], [class*="toast" i], [class*="error" i], [class*="alert" i], [class*="banner" i]';
    const pat = /(failed to upload|upload failed|error uploading|could ?n[o']t upload|failed to attach|upload error)/i;
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && style.display !== 'none' &&
            style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const matching = () => Array.from(document.querySelectorAll(selector)).filter((el) => {
        const text = (el.textContent || '').trim();
        return text && text.length < 300 && pat.test(text) && visible(el);
    });
    const baselineNodes = matching();
    const baseline = new WeakSet(baselineNodes);
    const touched = new Set();
    const mark = (node) => {
        const el = node && (node.nodeType === 1 ? node : node.parentElement);
        if (!el) return;
        const candidates = [];
        if (el.matches && el.matches(selector)) candidates.push(el);
        const closest = el.closest && el.closest(selector);
        if (closest) candidates.push(closest);
        if (el.querySelectorAll) candidates.push(...el.querySelectorAll(selector));
        for (const candidate of candidates) {
            const text = (candidate.textContent || '').trim();
            if (text && text.length < 300 && pat.test(text)) touched.add(candidate);
        }
    };
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mark(mutation.target);
            for (const node of mutation.addedNodes || []) mark(node);
        }
    });
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'role']
    });

    const network = { accepted: false, failed: false, events: [] };
    const consider = (url, status, phase) => {
        const u = String(url || '');
        const s = Number(status || 0);
        if (!u && phase !== 'fail') return;
        if (network.events.length < 24) {
            network.events.push({ url: u.slice(0, 160), status: s, phase: String(phase || '') });
        }
        // Binding the uploaded object to the form field is the real success signal.
        if (/setformvaluetofile|completefileupload|confirmfileupload|registeruploadedfile|finalizefileupload/i.test(u) && s >= 200 && s < 300) {
            network.accepted = true;
        }
        // Signed-URL mint alone is NOT success — Ashby does that before S3.
        if (/(uploaded-files|s3[.-]|amazonaws\\.com)/i.test(u)) {
            // status 0 + fail phase = ERR_EMPTY_RESPONSE / aborted / network error.
            // Do NOT treat resource-timing status 0 alone as failure (opaque CORS).
            if (s >= 400 || phase === 'fail' || (phase === 'xhr' && s === 0)) {
                network.failed = true;
            }
            if (s >= 200 && s < 300) {
                // Opaque S3 success (rare) — still wait for setFormValue unless failed.
            }
        }
    };
    let perfObserver = null;
    try {
        perfObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                consider(entry.name, Number(entry.responseStatus || 0), 'resource');
            }
        });
        perfObserver.observe({ type: 'resource', buffered: true });
    } catch (e) { /* older browsers */ }

    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            try {
                const res = await origFetch.apply(this, args);
                consider(url || res.url, res.status, 'fetch');
                return res;
            } catch (err) {
                consider(url, 0, 'fail');
                throw err;
            }
        };
    }
    const XO = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    let origOpen = null;
    let origSend = null;
    if (XO) {
        origOpen = XO.open;
        origSend = XO.send;
        XO.open = function(method, url, ...rest) {
            this.__scoutUploadUrl = url;
            return origOpen.call(this, method, url, ...rest);
        };
        XO.send = function(...args) {
            this.addEventListener('load', () => {
                consider(this.__scoutUploadUrl || '', this.status, 'xhr');
            });
            this.addEventListener('error', () => {
                consider(this.__scoutUploadUrl || '', 0, 'fail');
            });
            this.addEventListener('abort', () => {
                consider(this.__scoutUploadUrl || '', 0, 'fail');
            });
            return origSend.apply(this, args);
        };
    }

    window.__scoutUploadAttempts = window.__scoutUploadAttempts || {};
    window.__scoutUploadAttempts[token] = {
        input: this,
        expectedName,
        expectedSize,
        baseline,
        touched,
        observer,
        selector,
        pat,
        visible,
        network,
        perfObserver,
        origFetch,
        origOpen,
        origSend,
        startedAt: performance.now()
    };
    return {
        baselineCount: baselineNodes.length,
        baselineErrors: baselineNodes.map((el) => (el.textContent || '').trim().slice(0, 160))
    };
}
"""

_JS_READ_UPLOAD_ATTEMPT = """
((token) => {
    const state = window.__scoutUploadAttempts && window.__scoutUploadAttempts[token];
    if (!state) return { missing: true };
    const file = state.input.files && state.input.files[0];
    // Never treat baseline toasts as new rejections — Ashby leaves the prior
    // attempt's toast in the DOM and animating it must not poison a retry.
    const newErrors = Array.from(state.touched).filter((el) => {
        if (state.baseline.has(el)) return false;
        if (!el.isConnected || !state.visible(el)) return false;
        const text = (el.textContent || '').trim();
        return text && text.length < 300 && state.pat.test(text);
    }).map((el) => (el.textContent || '').trim().slice(0, 160));
    const scope = state.input.closest(
        '[role="presentation"], [class*="upload" i], [class*="file" i], label'
    ) || state.input.parentElement || document;
    const controls = Array.from(scope.querySelectorAll('button, [role="button"]'));
    const acceptedControl = controls.some((el) => {
        const label = `${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`;
        return /(delete|remove|replace)\\s*(file|upload)?/i.test(label);
    });
    const uploadResources = performance.getEntriesByType('resource').filter((entry) => {
        return entry.startTime >= state.startedAt &&
            /(upload|setformvaluetofile|completefileupload|s3[.-]|uploaded-files|amazonaws)/i.test(entry.name || '');
    });
    for (const entry of uploadResources) {
        const status = Number(entry.responseStatus || 0);
        const name = entry.name || '';
        if (/setformvaluetofile|completefileupload|confirmfileupload|registeruploadedfile|finalizefileupload/i.test(name) && status >= 200 && status < 300) {
            state.network.accepted = true;
        }
        if (/(uploaded-files|s3[.-]|amazonaws\\.com)/i.test(name) && status >= 400) {
            state.network.failed = true;
        }
    }
    return {
        missing: false,
        elapsedMs: performance.now() - state.startedAt,
        attached: {
            count: state.input.files ? state.input.files.length : 0,
            name: file ? file.name : '',
            size: file ? file.size : 0
        },
        acceptedControl,
        networkAccepted: !!(state.network && state.network.accepted),
        networkFailed: !!(state.network && state.network.failed),
        networkEvents: (state.network && state.network.events) || [],
        uploadResources: uploadResources.map((entry) => ({
            name: entry.name,
            status: Number(entry.responseStatus || 0),
            duration: entry.duration
        })),
        newErrors
    };
})($TOKEN)
"""

_JS_STOP_UPLOAD_ATTEMPT = """
((token) => {
    const attempts = window.__scoutUploadAttempts;
    const state = attempts && attempts[token];
    if (!state) return false;
    try { state.observer.disconnect(); } catch (e) {}
    try { if (state.perfObserver) state.perfObserver.disconnect(); } catch (e) {}
    try {
        if (state.origFetch) window.fetch = state.origFetch;
        if (state.origOpen && window.XMLHttpRequest) {
            window.XMLHttpRequest.prototype.open = state.origOpen;
            window.XMLHttpRequest.prototype.send = state.origSend;
        }
    } catch (e) {}
    delete attempts[token];
    return true;
})($TOKEN)
"""

_JS_CLEAR_FILE_INPUT = """
function() {
    try {
        const dt = new DataTransfer();
        this.files = dt.files;
    } catch (e) {
        try { this.value = ''; } catch (e2) {}
    }
    this.dispatchEvent(new Event('input', { bubbles: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
    return this.files ? this.files.length : -1;
}
"""

# Legacy visible scan used only when pre_submit_check runs without any upload action
# state. Normal uploads use the attempt observer above.
_JS_FIND_UPLOAD_ERROR = """
(() => {
    const pat = /(failed to upload|upload failed|error uploading|could ?n[o']t upload|failed to attach|upload error)/i;
    const nodes = document.querySelectorAll(
        '[role="alert"], [role="status"], [class*="toast" i], [class*="error" i], [class*="alert" i], [class*="banner" i]'
    );
    for (const el of nodes) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const text = (el.textContent || '').trim();
        if (text && text.length < 300 && pat.test(text)) return text.slice(0, 160);
    }
    return null;
})()
"""


def _upload_field_key(node) -> str:
    """Stable per-form-field key used for retries and multi-upload isolation."""
    attrs = getattr(node, "attributes", None) or {}
    identity = attrs.get("id") or attrs.get("name") or str(node.backend_node_id)
    frame_id = getattr(node, "frame_id", None) or "main"
    return f"{frame_id}:{identity}"


async def _start_upload_attempt(
    browser_session,
    node,
    token: str,
    *,
    expected_name: str,
    expected_size: int,
) -> dict:
    cdp_session = await browser_session.cdp_client_for_node(node)
    resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
        params={"backendNodeId": node.backend_node_id},
        session_id=cdp_session.session_id,
    )
    object_id = (resolved.get("object") or {}).get("objectId")
    if not object_id:
        return {}
    result = await cdp_session.cdp_client.send.Runtime.callFunctionOn(
        params={
            "objectId": object_id,
            "functionDeclaration": _JS_START_UPLOAD_ATTEMPT,
            "arguments": [
                {"value": token},
                {"value": expected_name},
                {"value": expected_size},
            ],
            "returnByValue": True,
        },
        session_id=cdp_session.session_id,
    )
    return (result.get("result") or {}).get("value") or {}


async def _read_upload_attempt(browser_session, node, token: str) -> dict:
    cdp_session = await browser_session.cdp_client_for_node(node)
    expression = _JS_READ_UPLOAD_ATTEMPT.replace("$TOKEN", json.dumps(token))
    result = await cdp_session.cdp_client.send.Runtime.evaluate(
        params={"expression": expression, "returnByValue": True},
        session_id=cdp_session.session_id,
    )
    return (result.get("result") or {}).get("value") or {}


async def _stop_upload_attempt(browser_session, node, token: str | None) -> None:
    if not token:
        return
    try:
        cdp_session = await browser_session.cdp_client_for_node(node)
        expression = _JS_STOP_UPLOAD_ATTEMPT.replace("$TOKEN", json.dumps(token))
        await cdp_session.cdp_client.send.Runtime.evaluate(
            params={"expression": expression, "returnByValue": True},
            session_id=cdp_session.session_id,
        )
    except Exception:
        logger.debug("Could not stop upload attempt tracker %s", token, exc_info=True)


def _attached_matches(status: dict, expected_name: str, expected_size: int) -> bool:
    attached = status.get("attached") or {}
    return (
        attached.get("count") == 1
        and attached.get("name") == expected_name
        and attached.get("size") == expected_size
    )


async def _clear_file_input(browser_session, node) -> None:
    """Clear an <input type=file> so a retry fires a fresh change/upload cycle."""
    try:
        cdp_session = await browser_session.cdp_client_for_node(node)
        resolved = await cdp_session.cdp_client.send.DOM.resolveNode(
            params={"backendNodeId": node.backend_node_id},
            session_id=cdp_session.session_id,
        )
        object_id = (resolved.get("object") or {}).get("objectId")
        if not object_id:
            return
        await cdp_session.cdp_client.send.Runtime.callFunctionOn(
            params={
                "objectId": object_id,
                "functionDeclaration": _JS_CLEAR_FILE_INPUT,
                "returnByValue": True,
            },
            session_id=cdp_session.session_id,
        )
    except Exception:
        logger.debug("Could not clear file input before attach", exc_info=True)


async def _await_upload_outcome(
    browser_session,
    node,
    token: str,
    *,
    expected_name: str,
    expected_size: int,
) -> dict:
    """Poll until this attempt is accepted, rejected, or fails to attach.

    Acceptance requires a same-origin file-binding network success (e.g. Ashby's
    setFormValueToFile). A visible Delete/Remove control or a file sitting on the
    input is NOT enough — Ashby shows those before the S3 POST completes, and
    ERR_EMPTY_RESPONSE leaves a decorative Remove button with a broken upload.
    """
    started = time.monotonic()
    last: dict = {}
    while True:
        last = await _read_upload_attempt(browser_session, node, token)
        elapsed = time.monotonic() - started
        errors = last.get("newErrors") or []
        if errors:
            return {"status": "rejected", "error": errors[0], "details": last}
        if last.get("networkFailed"):
            return {
                "status": "rejected",
                "error": "The site's file upload request failed on the network",
                "details": last,
            }

        exact_file = _attached_matches(last, expected_name, expected_size)
        if elapsed >= _UPLOAD_SETTLE_MIN and exact_file and last.get("networkAccepted"):
            return {"status": "accepted", "signal": "network_success", "details": last}
        if elapsed >= _UPLOAD_SETTLE_TIMEOUT:
            if exact_file and not last.get("networkAccepted"):
                # File sits on the input but Ashby never confirmed storage — do NOT
                # accept. Caller may fall back to byte injection / retry.
                return {
                    "status": "network_unconfirmed",
                    "details": last,
                    "error": (
                        f"{expected_name} is attached in the browser but the site "
                        "never confirmed the upload over the network"
                    ),
                }
            if exact_file:
                return {"status": "accepted", "signal": "exact_file_timeout", "details": last}
            return {"status": "attach_failed", "details": last}
        await asyncio.sleep(_UPLOAD_SETTLE_POLL)


async def _detect_upload_rejection(
    browser_session, node=None, wait: float = 0
) -> str | None:
    """Legacy global scan for runs where no upload state is available."""
    try:
        if wait > 0:
            await asyncio.sleep(wait)
        if node is not None:
            cdp_session = await browser_session.cdp_client_for_node(node)
        else:
            cdp_session = await browser_session.get_or_create_cdp_session()
        res = await cdp_session.cdp_client.send.Runtime.evaluate(
            params={"expression": _JS_FIND_UPLOAD_ERROR, "returnByValue": True},
            session_id=cdp_session.session_id,
        )
        value = (res.get("result") or {}).get("value")
        return value if isinstance(value, str) and value else None
    except Exception:
        return None


async def _current_upload_blocker(
    browser_session, upload_state: dict | None
) -> str | None:
    """Return a current, attempt-owned upload blocker at the submit boundary."""
    fields = (upload_state or {}).get("fields") or {}
    if not fields:
        return await _detect_upload_rejection(browser_session, wait=0)

    for field in fields.values():
        if field.get("status") == "failed":
            return field.get("last_error") or "A file upload failed"
        if field.get("status") != "accepted":
            continue
        try:
            current = await _read_upload_attempt(
                browser_session, field["node"], field["token"]
            )
        except Exception:
            # Preserve pre-submit's established fail-open behavior for probe errors.
            logger.debug("Upload submit-boundary probe failed", exc_info=True)
            continue
        if current.get("missing"):
            # Attempt tracker stopped — fall through to the global late-toast scan.
            continue
        errors = current.get("newErrors") or []
        if errors:
            return errors[0]
        if current.get("networkFailed"):
            return "The site's file upload request failed on the network"
        if not current.get("networkAccepted"):
            return (
                f"{field['expected_name']} is attached but the site never "
                "confirmed the upload over the network"
            )
        if not _attached_matches(
            current, field["expected_name"], field["expected_size"]
        ):
            return f"{field['expected_name']} is no longer attached"

    # Ashby can toast "failed to upload" AFTER we declared network acceptance
    # (late S3 failure / abort). Always re-scan the live page at submit time.
    return await _detect_upload_rejection(browser_session, wait=0)


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

    Single-file forms keep the old leniency (use the one available file). With
    several files available (resume + cover letter + transcript), the model is told
    the exact paths, but can still mis-transcribe — so match by basename, then by a
    'cover'/'transcript'/'resume' token hint, before falling back to the first
    available file (the resume).
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
    for token in ("cover", "transcript", "resume"):
        if token in req:
            for p in available:
                if token in os.path.basename(p).lower():
                    return p
    return available[0]


def _install_robust_upload(tools: Tools, bb_session_id: str | None = None) -> dict:
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

    Attach ladder: _attach_file_native (Browserbase session upload + native
    DOM.setFileInputFiles — trusted change events, requires bb_session_id) →
    _attach_resume_bytes (in-page byte injection, synthetic events). Either way, a
    verified attach is observed by an attempt-scoped state machine. Existing alerts
    are a baseline, so only new/re-triggered errors count. Retries and accepted state
    are isolated by actual file input, including multi-document forms.
    """
    upload_state: dict = {"fields": {}, "staged_uploads": {}}
    upload_desc = (
        "Upload a local file (e.g. the resume) to a file input on the page. "
        "Provide 'path' (the absolute file path). 'index' is optional — if omitted, "
        "the first file input on the page that does not already hold a file is "
        "auto-detected. For a form with additional upload fields (e.g. a "
        "cover-letter or transcript upload), call this again with the 'index' of "
        "that field. "
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
            # A failed file remains attached on several ATSs. On a multi-upload form,
            # blindly choosing the first empty input would send a resume retry into
            # the cover-letter/transcript slot. Prefer the field that previously
            # attempted this exact path.
            prior_field_key = next(
                (
                    key
                    for key, field in upload_state["fields"].items()
                    if field.get("path") == path and field.get("status") == "failed"
                ),
                None,
            )
            if prior_field_key is not None:
                for element in selector_map.values():
                    if (
                        browser_session.is_file_input(element)
                        and _upload_field_key(element) == prior_field_key
                    ):
                        file_input_node = element
                        break
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

        expected_name = os.path.basename(path)
        try:
            expected_size = os.path.getsize(path)
        except OSError as exc:
            return ActionResult(error=f"Upload file cannot be read ({exc}).")
        field_key = _upload_field_key(file_input_node)
        field_state = upload_state["fields"].setdefault(
            field_key, {"failures": 0, "status": "idle"}
        )
        await _stop_upload_attempt(
            browser_session, field_state.get("node", file_input_node), field_state.get("token")
        )
        token = f"{field_key}:{time.monotonic_ns()}"
        try:
            baseline = await _start_upload_attempt(
                browser_session,
                file_input_node,
                token,
                expected_name=expected_name,
                expected_size=expected_size,
            )
        except Exception as exc:
            logger.warning(
                "Could not initialize upload verification for field %s: %s",
                field_key,
                exc,
            )
            field_state.update(
                {
                    "status": "failed",
                    "path": path,
                    "last_error": "Upload verification could not start",
                }
            )
            return ActionResult(
                error=(
                    "Resume upload verification could not start; the file was not "
                    "attached. Refresh page state and retry once."
                )
            )
        if not baseline:
            field_state.update(
                {
                    "status": "failed",
                    "path": path,
                    "last_error": "Upload verification could not resolve the file input",
                }
            )
            return ActionResult(
                error=(
                    "Resume upload verification could not resolve the file input; "
                    "the file was not attached. Refresh page state and retry once."
                )
            )
        field_state.update(
            {
                "node": file_input_node,
                "token": token,
                "path": path,
                "expected_name": expected_name,
                "expected_size": expected_size,
                "status": "uploading",
                "last_error": None,
            }
        )
        logger.info(
            "Upload attempt started field=%s file=%s bytes=%d baseline_errors=%s",
            field_key,
            expected_name,
            expected_size,
            baseline.get("baselineErrors") or [],
        )

        # Fresh change event: clearing a prior (failed) FileList forces Ashby to
        # mint a new upload handle instead of no-oping on an identical File.
        await _clear_file_input(browser_session, file_input_node)

        try:
            result = None
            used_native = False
            if _NATIVE_UPLOAD and bb_session_id:
                result = await _attach_file_native(
                    browser_session,
                    file_input_node,
                    path,
                    bb_session_id,
                    upload_state["staged_uploads"],
                )
                used_native = result is not None and not result.error
            if result is None:
                result = await _attach_resume_bytes(browser_session, file_input_node, path)
                used_native = False
        except Exception as exc:
            logger.warning("In-page resume injection failed: %s", exc)
            field_state.update(
                {
                    "status": "failed",
                    "last_error": f"Resume upload failed ({exc})",
                }
            )
            return ActionResult(
                error=f"Resume upload failed ({exc}); the resume is NOT attached. "
                "Refresh page state and retry the upload once."
            )

        if result.error:
            field_state.update(
                {"status": "failed", "last_error": result.error}
            )
            return result

        try:
            outcome = await _await_upload_outcome(
                browser_session,
                file_input_node,
                token,
                expected_name=expected_name,
                expected_size=expected_size,
            )
        except Exception as exc:
            field_state.update(
                {
                    "status": "failed",
                    "last_error": f"Upload verification failed ({exc})",
                }
            )
            logger.warning(
                "Upload verification failed field=%s file=%s: %s",
                field_key,
                expected_name,
                exc,
            )
            return ActionResult(
                error=(
                    f"Resume upload verification failed ({exc}); refresh page state "
                    "and retry the upload once."
                )
            )

        # Native attach showed a file but Ashby never confirmed over the network
        # (S3 ERR_EMPTY_RESPONSE / toast). One byte-injection retry with a fresh observer.
        if (
            used_native
            and outcome["status"] in {"network_unconfirmed", "rejected"}
        ):
            logger.warning(
                "Native upload unconfirmed/rejected field=%s file=%s status=%s; "
                "retrying with in-page byte injection.",
                field_key,
                expected_name,
                outcome["status"],
            )
            await _stop_upload_attempt(browser_session, file_input_node, token)
            await _clear_file_input(browser_session, file_input_node)
            token = f"{field_key}:{time.monotonic_ns()}"
            try:
                baseline = await _start_upload_attempt(
                    browser_session,
                    file_input_node,
                    token,
                    expected_name=expected_name,
                    expected_size=expected_size,
                )
            except Exception as exc:
                baseline = None
                logger.warning("Byte-injection upload observer failed to start: %s", exc)
            if baseline:
                field_state.update({"token": token, "status": "uploading"})
                try:
                    result = await _attach_resume_bytes(
                        browser_session, file_input_node, path
                    )
                    if not result.error:
                        outcome = await _await_upload_outcome(
                            browser_session,
                            file_input_node,
                            token,
                            expected_name=expected_name,
                            expected_size=expected_size,
                        )
                except Exception as exc:
                    logger.warning("Byte-injection upload retry failed: %s", exc)
                    outcome = {
                        "status": "network_unconfirmed",
                        "error": str(exc),
                        "details": {},
                    }

        if outcome["status"] == "accepted":
            field_state.update(
                {
                    "status": "accepted",
                    "failures": 0,
                    "last_error": None,
                }
            )
            logger.info(
                "ATS accepted upload field=%s file=%s bytes=%d signal=%s",
                field_key,
                expected_name,
                expected_size,
                outcome.get("signal"),
            )
            return result

        if outcome["status"] in {"attach_failed", "network_unconfirmed"}:
            details = outcome.get("details") or {}
            message = outcome.get("error") or (
                f"Resume upload failed: {expected_name} did not remain attached "
                f"with the expected {expected_size} bytes (state={details.get('attached')})."
            )
            field_state.update({"status": "failed", "last_error": message})
            logger.warning(
                "Upload did not reach confirmed state field=%s file=%s status=%s state=%s",
                field_key,
                expected_name,
                outcome["status"],
                details,
            )
            return ActionResult(error=message + " Refresh page state and retry once.")

        rejection = outcome.get("error") or "The site reported an upload error"
        field_state["failures"] = int(field_state.get("failures") or 0) + 1
        field_state.update({"status": "failed", "last_error": rejection})
        logger.warning(
            "ATS rejected upload field=%s file=%s field_strike=%d: %s",
            field_key,
            expected_name,
            field_state["failures"],
            rejection,
        )
        if field_state["failures"] == 1:
            return ActionResult(
                error=(
                    f'The site REJECTED the upload server-side: "{rejection}". The file '
                    "shows on the form but the site failed to store it, so the upload "
                    "did NOT succeed. Retry this upload_file action ONCE."
                )
            )
        return ActionResult(
            error=(
                f'The site rejected the upload again: "{rejection}". Do NOT submit the '
                "form — a submission with a failed upload will be refused. Call done "
                "now and report that the resume upload failed (include the words "
                "'resume upload failed' in your done text)."
            )
        )

    return upload_state


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


def transcript_filename(applicant_name: str | None) -> str:
    """
    ATS-visible transcript filename, personalized like resume_filename
    ("Rabuor Tindi" -> "Rabuor_Tindi_Transcript.pdf"). The distinct '_Transcript'
    token lets the upload tool tell it apart from the resume/cover letter by
    basename.
    """
    stem = re.sub(r"[^A-Za-z0-9]+", "_", applicant_name or "").strip("_")
    return f"{stem}_Transcript.pdf" if stem else "Transcript.pdf"


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


def _security_clearance_lines(user_data: dict) -> list[str]:
    """
    Security-clearance answers from the profile (the Security Clearance section).
    Clearance questions are eligibility-critical on defense/aerospace/gov forms and a
    wrong "Yes" is a misrepresentation, so: an unanswered profile section (status
    NULL) contributes only a safe "No active clearance" answer and stays silent on
    willingness — the agent then treats a willingness question like any other
    unanswered question instead of defaulting to "No".
    """
    status = (user_data.get("security_clearance_status") or "").strip()
    levels = [
        str(level).strip()
        for level in (user_data.get("security_clearances") or [])
        if str(level).strip()
    ]
    held = ", ".join(levels)

    if status == "active":
        lines = [
            f"- Security clearance: ACTIVE — {held}" if held
            else "- Security clearance: ACTIVE (level not specified)",
            "- Do you hold an active security clearance: Yes"
            + (f" ({held})" if held else ""),
        ]
    elif status == "inactive":
        lines = [
            f"- Security clearance: previously held ({held}), currently inactive" if held
            else "- Security clearance: previously held, currently inactive",
            "- Do you hold an active security clearance: No"
            + (f" (previously held: {held})" if held else " (previously held one)"),
        ]
    else:
        # 'none' or unanswered — never claim a clearance either way.
        lines = ["- Do you hold an active security clearance: No"]

    if status:
        willing = "Yes" if user_data.get("willing_to_obtain_clearance") or status == "active" else "No"
        lines.append(
            f"- Willing to obtain a security clearance / undergo a background investigation if required: {willing}"
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


_RESUME_HIGHLIGHTS_MAX_CHARS = 2200


def _resume_highlights(resume: dict | None) -> str:
    """
    Compact digest of the Jake-format resume JSON (experience, projects, skills) for
    the applicant context. This is the agent's ONLY view of the resume content — the
    PDF is uploaded as a file the LLM never reads — and without it every open-ended
    answer degenerates into abstract filler because the model has no concrete
    projects/employers/tech to cite. Capped so it can't blow up the prompt; never
    raises (context building must not fail).
    """
    if not isinstance(resume, dict):
        return ""
    lines: list[str] = []
    try:
        for exp in (resume.get("experience") or [])[:4]:
            if not isinstance(exp, dict):
                continue
            title = str(exp.get("title") or "").strip()
            company = str(exp.get("company") or "").strip()
            header = " at ".join(part for part in (title, company) if part)
            if not header:
                continue
            bullets = [
                str(b).strip() for b in (exp.get("bullets") or [])[:2] if str(b).strip()
            ]
            lines.append(f"  • Experience: {header}" + (f" — {' '.join(bullets)}" if bullets else ""))
        for proj in (resume.get("projects") or [])[:4]:
            if not isinstance(proj, dict):
                continue
            name = str(proj.get("name") or "").strip()
            if not name:
                continue
            tech = ", ".join(
                str(t).strip() for t in (proj.get("tech_stack") or [])[:5] if str(t).strip()
            )
            bullets = [
                str(b).strip() for b in (proj.get("bullets") or [])[:2] if str(b).strip()
            ]
            line = f"  • Project: {name}"
            if tech:
                line += f" ({tech})"
            if bullets:
                line += f" — {' '.join(bullets)}"
            lines.append(line)
        skills = resume.get("skills")
        if isinstance(skills, dict):
            flat = [
                str(s).strip()
                for group in skills.values()
                if isinstance(group, list)
                for s in group[:8]
                if str(s).strip()
            ]
            if flat:
                lines.append(f"  • Skills: {', '.join(flat[:16])}")
    except Exception:  # noqa: BLE001
        return ""
    text = "\n".join(lines)
    if len(text) > _RESUME_HIGHLIGHTS_MAX_CHARS:
        text = text[:_RESUME_HIGHLIGHTS_MAX_CHARS].rsplit("\n", 1)[0]
    return text


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


def _verdict_from_agent_history(result: AgentHistoryList) -> dict | None:
    """Recover a post_submit_check classification from action/extracted text."""
    texts: list[str] = []
    try:
        final = result.final_result() or ""
        if final:
            texts.append(final)
    except Exception:
        pass
    try:
        # AgentHistoryList exposes errors / content inconsistently across versions;
        # gather any stringified history entries best-effort.
        history = getattr(result, "history", None) or []
        for item in history:
            for attr in ("result", "model_output", "state"):
                value = getattr(item, attr, None)
                if value is None:
                    continue
                texts.append(str(value))
    except Exception:
        pass
    blob = "\n".join(texts).lower()
    if "classification=spam_blocked" in blob or final_text_looks_like_spam(blob):
        return {
            "classification": "spam_blocked",
            "confidence": "high",
            "evidence": [],
            "urlChanged": False,
        }
    if "classification=confirmed" in blob:
        return {
            "classification": "confirmed",
            "confidence": "high",
            "evidence": [],
            "urlChanged": True,
        }
    if "classification=captcha" in blob:
        return {
            "classification": "captcha",
            "confidence": "high",
            "evidence": [],
            "urlChanged": False,
        }
    if "classification=verification_gate" in blob:
        return {
            "classification": "verification_gate",
            "confidence": "high",
            "evidence": [],
            "urlChanged": False,
        }
    if "classification=validation_errors" in blob:
        return {
            "classification": "validation_errors",
            "confidence": "medium",
            "evidence": [],
            "urlChanged": False,
        }
    if "classification=still_on_form" in blob:
        return {
            "classification": "still_on_form",
            "confidence": "medium",
            "evidence": [],
            "urlChanged": False,
        }
    return None


def _interpret_agent_result(
    result: AgentHistoryList,
    *,
    post_submit_verdict: dict | None = None,
) -> dict:
    """Map browser-use AgentHistoryList to Scout apply result.

    When a DOM post_submit_verdict is available it takes priority over loose
    free-text substring matching in the agent's done message.
    """
    agent_success = result.is_successful()
    final_raw = result.final_result() or ""
    final = final_raw.lower()
    verdict = post_submit_verdict if isinstance(post_submit_verdict, dict) else None
    classification = (verdict or {}).get("classification") if verdict else None

    def _spam_attention() -> dict:
        return {
            "success": False,
            "error_code": "spam_blocked",
            "error": "The job site rejected the submission as possible spam",
            "needs_attention": True,
            "attention_question": (
                "The job site flagged this application as possible spam and refused it. "
                "Please submit it manually on the job page — retrying with Scout is "
                "unlikely to help and may reinforce the block."
            ),
        }

    # DOM verdict first — never let ambiguous done text override a clear spam/CAPTCHA.
    if classification == "spam_blocked" or final_text_looks_like_spam(final):
        return _spam_attention()
    if classification == "captcha" or (
        "captcha" in final and classification != "confirmed"
    ):
        return {
            "success": False,
            "error_code": "captcha_detected",
            "error": "CAPTCHA detected",
            "needs_attention": True,
            "attention_question": "CAPTCHA verification required — please apply manually",
        }
    if classification == "verification_gate" or (
        "verification code" in final or "security code" in final
    ):
        return {
            "success": False,
            "error_code": "verification_code_timeout",
            "error": "The job site required an emailed verification code that was not provided in time",
            "needs_attention": True,
            "attention_question": (
                "The site required an email verification step that Scout couldn't "
                "complete automatically this time. Re-run this application to try "
                "again — or apply manually."
            ),
        }
    if classification == "validation_errors":
        return {
            "success": False,
            "error_code": "post_submit_validation_errors",
            "error": "The form still showed validation errors after submit",
            "needs_attention": True,
            "attention_question": (
                "The employer's form still showed validation errors after Scout "
                "tried to submit. Please review the job page and finish manually if needed."
            ),
        }
    if classification == "confirmed" or (
        agent_success is True and classification in {None, "confirmed"}
    ):
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

    if "required fields incomplete" in final:
        return {
            "success": False,
            "error_code": "required_fields_incomplete",
            "error": final_raw or "Required fields were still empty at submit time",
            "needs_attention": False,
        }

    if "missing required document" in final:
        # The form requires a document Scout doesn't hold (e.g. an unofficial
        # transcript) — un-submittable no matter how many steps we spend, so the
        # prompt tells the agent to bail out early with this phrase. Never
        # retried: the document won't materialize on a re-run.
        return {
            "success": False,
            "error_code": "missing_required_document",
            "error": final_raw or "The form requires a document Scout does not have",
            "needs_attention": True,
            "attention_question": (
                "This application requires a document Scout doesn't have on file "
                "(for example a transcript). Please apply manually on the job page."
            ),
        }
    if "resume upload failed" in final or "resume failed to upload" in final:
        # The ATS rejected the file server-side (Ashby-style red toast) and the
        # agent bailed out BEFORE submitting — deliberately: submitting a form whose
        # resume never stored gets refused, and on Ashby it burns a spam flag
        # (2026-07-14 Tessera run). A re-run gets a fresh session/IP, so retrying
        # from the tracker is a reasonable next step.
        return {
            "success": False,
            "error_code": "resume_upload_failed",
            "error": final_raw or "The job site rejected the resume upload",
            "needs_attention": True,
            "attention_question": (
                "The job site kept rejecting the resume file upload, so Scout stopped "
                "before submitting. Retry this application, or apply manually on the "
                "job page."
            ),
        }

    if agent_success is False:
        return {
            "success": False,
            "error": final_raw or "Agent reported failure",
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

    # Loose confirm phrases only count when the DOM verdict agrees (or is absent).
    if classification in {None, "confirmed"} and final_text_looks_confirmed(final):
        return {
            "success": True,
            "error_code": None,
            "error": None,
            "needs_attention": False,
        }
    if classification == "still_on_form":
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
        self,
        user_data: dict,
        tmp_path: str,
        cover_letter_path: str | None = None,
        transcript_path: str | None = None,
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
        if transcript_path:
            trailing.append(f"- Transcript file path: {transcript_path}")
        trailing.extend([
            f"- Work authorization question: {auth_answer}",
            f"- Requires visa sponsorship: {sponsorship}",
        ])
        trailing.extend(_security_clearance_lines(user_data))
        trailing.append(f"- Employer for this application: {company}")
        if job_title:
            trailing.append(f"- Role for this application: {job_title}")
        trailing.extend(_self_identification_lines(user_data))
        highlights = _resume_highlights(user_data.get("resume_json"))
        if highlights:
            trailing.extend([
                "Resume content (the applicant's REAL projects, experience, and skills — "
                "the only source of specifics for any written answer):",
                highlights,
            ])
        trailing.extend([
            "For an open-ended text question that matches one of these pre-written answers, "
            "use it (placeholders already resolved):",
            answers_text if answers_text else "(no pre-written answers on file)",
            "For open-ended questions NOT covered by a pre-written answer, compose the answer "
            "yourself from the resume content and applicant data above, following the "
            "free-text answer rules in the task.",
        ])
        details.extend(trailing)
        return "\n".join(details)

    def _build_apply_task(
        self,
        job_url: str,
        context: str,
        resume_filename: str,
        cover_letter_filename: str | None = None,
        transcript_filename: str | None = None,
        has_pre_submit_check: bool = False,
    ) -> str:
        if has_pre_submit_check:
            pre_submit_instruction = (
                "- Immediately before clicking the final Submit button, call "
                "`pre_submit_check` once. If it returns BLOCKED (required fields or "
                "upload error), fix the listed fields and call it again — do NOT click "
                "Submit. If it returns CANCEL, do NOT click Submit — call done reporting "
                "the application was cancelled by the user (include the word 'cancelled'). "
                "If it returns OK, submit normally.\n        "
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
        if transcript_filename:
            transcript_instructions = (
                f'- If the form has a transcript FILE-upload field (unofficial OR official transcript), '
                f'upload the TRANSCRIPT file (the "Transcript file path" in the data, which appears as '
                f'"{transcript_filename}") into it with its own `upload_file` action, passing the `index` '
                f'of the transcript upload field. Do this for both required AND optional transcript '
                f'upload fields. Never upload the resume or cover letter into a transcript field.'
            )
            # With a transcript on file, the fail-fast example must not name it.
            missing_doc_example = "a writing sample or certification"
        else:
            transcript_instructions = ""
            missing_doc_example = "an unofficial transcript"
        return f"""
        Go to this job application URL and complete the ENTIRE application:
        {job_url}

        The applicant data below is a reference pool — use it to answer whatever fields THIS SPECIFIC FORM shows.
        Not every form has fields for every piece of data. Do not expect to use all of it.
        {context}

        Complete the application in this order. Do not skip ahead to a later stage before the earlier one is done.

        STAGE 0 — Arrive like a person:
        - If the URL opens a job POSTING page (a description with an Apply button, or Overview/Application tabs) rather than the form itself, skim the posting the way someone deciding to apply would: scroll down through the description once (one or two scroll actions), then open the application form (click Apply / the Application tab). Do not study the posting — one brief skim, then move on.
        - If the URL opens directly onto the application form, skip this stage.

        STAGE 1 — Fill the visible fields:
        - When the form first loads, take a moment to read it top to bottom before you start filling — do not rush the first field the instant the page appears.
        - Look at the actual form fields first. Only fill fields that are VISIBLE and PRESENT on this specific form.
        - Never type into a field that is hidden or invisible (a spam-trap/honeypot). If the system refuses an input as a honeypot, leave it empty and move on — that is correct.
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
        - A visible filename is NOT enough if the page also shows an upload ERROR (e.g. a red message saying the file "failed to upload"): that means the site rejected the file server-side and the upload did NOT succeed. Re-upload ONCE. If the error appears again, do NOT fill anything further and do NOT submit — call done immediately reporting the failure (include the words "resume upload failed").
        {cover_letter_instructions}
        {transcript_instructions}
        - The files listed in the applicant data are the ONLY files you have. If the form has a REQUIRED file-upload field for any OTHER document (e.g. {missing_doc_example}) that is not covered by the rules above, the application cannot be submitted: do NOT upload a substitute file into it, and do NOT keep filling the rest of the form — call done immediately, naming the document (include the words "missing required document").

        STAGE 3 — Submit:
        - Fill any remaining VISIBLE required fields that are still empty. Skip applicant data that has no corresponding form field.
        - Submit the application only after the resume upload is confirmed and all visible required fields are satisfied. Never click Submit while a file-upload error message is visible anywhere on the page — resolve it first, or call done reporting the failed upload (see the upload stage rules).
        {pre_submit_instruction}- After clicking Submit, call `post_submit_check` once before calling done. Follow its classification guidance.
        - Confirm success ONLY with clear receipt evidence (thank you / application received / successfully submitted) and state that evidence in your done message.
        - If the page shows the application was flagged as possible spam, do NOT click Submit again and do NOT wait and resubmit — that reinforces the block. Call `post_submit_check`, then call done reporting the spam block (include the words "possible spam").
        - If submitting reveals an emailed verification/security code step ("a code was sent to <email>"), call `request_verification_code` (pass sent_to and code_length from the page). When it returns the code: click the FIRST code input box, type the ENTIRE code in one input action, then continue the submission. If it returns without a code, call it again — up to 3 calls total. If no code arrives after 3 calls, call done reporting that the emailed verification code was not provided (include the words "verification code").
        - If blocked by a CAPTCHA, report it explicitly in your done message.

        Notes:
        - Put a long free-text answer in a SINGLE input action with the full text. The system types it in realistically for you; do NOT split essay answers across multiple input actions.
        - Free-text answers must be CONCRETE, not abstract. Every answer names at least one real, specific thing from the applicant data — an actual project name, employer, technology, or result from the resume content — and says what the applicant actually built or did. Swap test: if the answer would still read fine with the project or company swapped for a different one, it is too vague — rewrite it around the specifics. WRONG (vague, never write this): "I built a small software project to organize technical work clearly, focusing on clean structure and maintainability. It taught me to break ambiguous problems into simple systems." RIGHT (shape to imitate): "I built <project name>, a <what it is> using <tech from the resume>, which <what it does / concrete result>. The hardest part was <specific challenge>, and I <specific thing learned>."
        - For a "describe a project/experience" question: name the thing, say what it does, name 1-2 technologies used, and give one concrete result or lesson. Default to 2-4 sentences unless the field demands otherwise, and respect any stated length limit.
        - Reference the actual role/company where natural, and vary your wording between answers. Ban boilerplate and generic filler ("I am a hard worker", "fast-paced environment", "passion for", "great fit", "clean structure, usability, and maintainability", "iterate based on feedback") — an answer that would fit any applicant or employer reads as templated/spammy. Never invent facts not in the applicant data.
        - Every interactive element listed in the browser state is actionable by its index RIGHT NOW, even if it is below the visible screenshot area — never scroll or re-navigate merely to reach an already-listed element.
        - Never use javascript: URLs and never navigate to about:blank.
        - Call done only when the application has been submitted and you have seen a confirmation, OR when you are genuinely blocked (CAPTCHA, spam, or required info you cannot answer from the data).
        """

    async def _run_phase(
        self,
        *,
        phase_name: str,
        task: str,
        browser: Browser,
        tmp_path: str,
        cover_letter_path: str | None = None,
        transcript_path: str | None = None,
        max_actions_per_step: int = 5,
        step_timeout: int = _AGENT_STEP_TIMEOUT,
        application_id: str | None = None,
        control_token: str | None = None,
        on_gate=None,
        fetch_code=None,
        on_code=None,
        bb_session_id: str | None = None,
    ) -> AgentHistoryList:
        logger.info("Starting browser agent phase: %s", phase_name)
        available_files = [tmp_path]
        if cover_letter_path:
            available_files.append(cover_letter_path)
        if transcript_path:
            available_files.append(transcript_path)
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
                bb_session_id=bb_session_id,
            ),
            available_file_paths=available_files,
            max_actions_per_step=max_actions_per_step,
            max_failures=_AGENT_MAX_FAILURES,
            step_timeout=step_timeout,
            include_attributes=[ 'id', 'type', 'aria-label', 'aria-labelledby',
                                 'placeholder', 'role', 'aria-required', 'value',
                                 'aria-expanded', 'name'],
        )
        # Loop watchdog: a schema-degraded or confused model can repeat the same
        # state-preserving action forever as a chain of "successes" that
        # max_failures never counts (the 2026-07-09 navigate loop). Track the
        # (actions, url) signature per step; nudge at _WATCHDOG_NUDGE_AT,
        # abort with PlannerDeadlock at _WATCHDOG_ABORT_AT. OTP polling and the
        # submit gate are exempt (they legitimately repeat identical calls).
        watchdog_state: dict = {"sig": None, "count": 0, "deadlock": False}

        async def _loop_watchdog(agent_ref):
            output = getattr(agent_ref.state, "last_model_output", None)
            actions = getattr(output, "action", None) if output else None
            if not actions:
                return
            dumps = []
            names: set[str] = set()
            for action in actions:
                dump = action.model_dump(exclude_none=True)
                dumps.append(dump)
                names.update(dump.keys())
            if names & _WATCHDOG_EXEMPT_ACTIONS:
                watchdog_state["sig"] = None
                watchdog_state["count"] = 0
                return
            try:
                url = await agent_ref.browser_session.get_current_page_url()
            except Exception:  # noqa: BLE001
                url = ""
            sig = json.dumps([dumps, url], sort_keys=True, default=str)
            if sig != watchdog_state["sig"]:
                watchdog_state["sig"] = sig
                watchdog_state["count"] = 1
                return
            watchdog_state["count"] += 1
            count = watchdog_state["count"]
            if count == _WATCHDOG_NUDGE_AT:
                logger.warning(
                    "Loop watchdog: identical action repeated %sx with no page "
                    "change (phase %s) — injecting corrective nudge.",
                    count, phase_name,
                )
                sentry_sdk.add_breadcrumb(
                    category="apply",
                    level="warning",
                    message="loop watchdog nudge",
                    data={"phase": phase_name, "repeats": count},
                )
                nudge = ActionResult(
                    error=(
                        f"LOOP DETECTED: you have executed the exact same action "
                        f"{count} times in a row and the page has NOT changed. "
                        "Repeating it again will fail. Choose a DIFFERENT action "
                        "type or target: interact with the form elements by index "
                        "(input/click). If you are genuinely blocked, call done "
                        "and report why."
                    )
                )
                if agent_ref.state.last_result:
                    agent_ref.state.last_result.append(nudge)
                else:
                    agent_ref.state.last_result = [nudge]
            elif count >= _WATCHDOG_ABORT_AT:
                watchdog_state["deadlock"] = True
                logger.error(
                    "Loop watchdog: identical action repeated %sx (phase %s) — "
                    "aborting run as planner_deadlock.",
                    count, phase_name,
                )
                with sentry_sdk.new_scope() as scope:
                    scope.set_tag("apply_failure", "planner_deadlock")
                    scope.set_level("error")
                    sentry_sdk.capture_message(
                        f"Loop watchdog abort: identical action repeated {count}x "
                        f"in {phase_name}"
                    )
                agent_ref.stop()

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
                agent.run(max_steps=_AGENT_MAX_STEPS, on_step_end=_loop_watchdog),
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
        if watchdog_state["deadlock"]:
            raise PlannerDeadlock(
                f"Phase {phase_name}: identical action repeated "
                f"{_WATCHDOG_ABORT_AT}x with no page change"
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
        transcript_path: str | None = None,
        max_actions_per_step: int,
        step_timeout: int,
        retry_stale_click_once: bool = False,
        retry_type_timeout_once: bool = False,
        application_id: str | None = None,
        geolocation: dict | None = None,
        block_ads: bool = True,
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
                transcript_path=transcript_path,
                max_actions_per_step=max_actions_per_step,
                step_timeout=step_timeout,
                application_id=application_id,
                control_token=control_token,
                on_gate=on_gate,
                fetch_code=fetch_code,
                on_code=on_code,
                bb_session_id=current_session_id,
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
                new_session, current_browser = self._new_browser_session(
                    geolocation, block_ads=block_ads
                )
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

    def _new_browser_session(
        self,
        geolocation: dict | None = None,
        *,
        block_ads: bool = True,
    ):
        # Hardened, shared session config (timeout/region/captcha) lives in
        # core.browserbase. block_ads is portal-policy driven (Ashby defaults off).
        # geolocation geo-targets the residential proxy to the applicant
        # (no-op unless proxies on).
        session = create_browserbase_session(
            geolocation=geolocation, block_ads=block_ads
        )
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

    def _run_pipeline_bounded(self, coro, *, deadline_seconds: float):
        """
        asyncio.run() replacement whose SHUTDOWN is also bounded.

        asyncio.run() cancels leftover tasks after the main coroutine returns and
        then waits for them — and for default-executor threads — with NO timeout.
        browser-use's post-run teardown (event-bus watchdogs, tab auto-recovery)
        can strand tasks that never finish cancelling on a dead WebSocket; that
        hung a worker for >90 minutes after a completed spam-blocked run, so the
        application row stayed in_progress and the refund never ran. Here the
        pipeline result is captured FIRST and every cleanup step is time-boxed;
        stuck tasks/threads are abandoned (the process outlives one apply, and
        the Browserbase session was already REST-released by _apply_async).
        """
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                asyncio.wait_for(coro, timeout=deadline_seconds)
            )
        finally:
            try:
                pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
                for task in pending:
                    task.cancel()
                if pending:
                    loop.run_until_complete(
                        asyncio.wait_for(
                            asyncio.gather(*pending, return_exceptions=True),
                            timeout=_LOOP_SHUTDOWN_TIMEOUT,
                        )
                    )
            except Exception:
                logger.warning(
                    "Apply event-loop shutdown did not finish within %ss; "
                    "abandoning stuck tasks.",
                    _LOOP_SHUTDOWN_TIMEOUT,
                )
            try:
                loop.run_until_complete(
                    asyncio.wait_for(loop.shutdown_asyncgens(), timeout=5)
                )
            except Exception:
                pass
            # Deliberately NOT loop.shutdown_default_executor(): it joins executor
            # threads unbounded — exactly the hang class this method exists to stop.
            asyncio.set_event_loop(None)
            loop.close()

    def apply(
        self,
        *,
        job_url: str,
        user_data: dict,
        resume_pdf: bytes,
        application_id: str | None = None,
        cover_letter_pdf: bytes | None = None,
        transcript_pdf: bytes | None = None,
        deadline_seconds: float = 870,
        control_token: str | None = None,
        portal: str | None = None,
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
        to the manual-paste relay. `portal` drives Ashby-specific session policy.

        Runs on a bounded event loop (NOT asyncio.run) — see _run_pipeline_bounded:
        the result MUST reach the Celery task's status/refund handlers even when
        browser-use teardown strands tasks that never finish cancelling.
        """
        try:
            return self._run_pipeline_bounded(
                self._apply_async(
                    job_url=job_url,
                    user_data=user_data,
                    resume_pdf=resume_pdf,
                    application_id=application_id,
                    cover_letter_pdf=cover_letter_pdf,
                    transcript_pdf=transcript_pdf,
                    control_token=control_token,
                    portal=portal,
                    on_gate=on_gate,
                    fetch_code=fetch_code,
                    on_code=on_code,
                ),
                deadline_seconds=deadline_seconds,
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
                        "The site's email verification step ran past the apply "
                        "deadline. Please check the job site and "
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
        transcript_pdf: bytes | None = None,
        control_token: str | None = None,
        portal: str | None = None,
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

        # Transcript is optional: the user uploads it once on the profile page and
        # job_tasks passes the bytes along. Without it, transcript-requiring forms
        # fail fast as missing_required_document.
        transcript_path: str | None = None
        transcript_upload_name: str | None = None
        if transcript_pdf:
            transcript_upload_name = transcript_filename(user_data.get("name"))
            transcript_path = os.path.join(tmp_dir, transcript_upload_name)
            with open(transcript_path, "wb") as fh:
                fh.write(transcript_pdf)

        session = None
        active_session_id: str | None = None
        browser = None
        diagnostics: dict = {"config": {}, "fingerprint": None}

        resolved_portal = resolve_portal(portal=portal, job_url=job_url)
        block_ads = resolve_block_ads(portal=resolved_portal, job_url=job_url)

        context = self._build_applicant_context(
            user_data, tmp_path, cover_letter_path, transcript_path
        )
        apply_task = self._build_apply_task(
            job_url, context, upload_filename, cover_letter_upload_name,
            transcript_upload_name,
            has_pre_submit_check=bool(application_id or control_token),
        )

        # Geo-target the residential proxy to the applicant's address so the exit IP
        # matches the form (Ashby's named "location mismatch" signal). No-op unless
        # BROWSERBASE_PROXIES is on; None falls back to a plain residential proxy.
        geolocation = _build_geolocation(user_data)
        diagnostics["config"] = {
            "portal": resolved_portal,
            "block_ads": block_ads,
            "proxies": BROWSERBASE_PROXIES,
            "region": BROWSERBASE_REGION,
            "geolocation": {
                k: geolocation.get(k)
                for k in ("city", "state", "country")
                if geolocation and geolocation.get(k)
            }
            if geolocation
            else None,
        }
        _emit_apply_telemetry(
            "apply.session.policy",
            diagnostics["config"],
            application_id=application_id,
        )

        try:
            session, browser = self._new_browser_session(
                geolocation, block_ads=block_ads
            )
            active_session_id = session.id if session else None
            diagnostics["config"]["session_id"] = active_session_id

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
                transcript_path=transcript_path,
                max_actions_per_step=1,
                step_timeout=_AGENT_STEP_TIMEOUT,
                retry_stale_click_once=True,
                retry_type_timeout_once=True,
                application_id=application_id,
                geolocation=geolocation,
                block_ads=block_ads,
                control_token=control_token,
                on_gate=on_gate,
                fetch_code=fetch_code,
                on_code=on_code,
            )
            active_session_id = current_session_id

            session_loss = _session_loss_reason(result)
            if session_loss:
                outcome = {
                    "success": False,
                    "portal": "browser_use",
                    "ats_portal": resolved_portal,
                    "session_id": active_session_id,
                    "error_code": "browser_session_lost",
                    "error": f"Browser session lost: {session_loss}",
                    "needs_attention": False,
                    "diagnostics": diagnostics,
                }
                _attach_apply_diagnostics(
                    diagnostics,
                    portal=resolved_portal,
                    error_code="browser_session_lost",
                )
                return outcome

            # Prefer the structured post_submit_check verdict recovered from history.
            post_verdict = _verdict_from_agent_history(result)

            outcome = _interpret_agent_result(result, post_submit_verdict=post_verdict)
            _emit_apply_telemetry(
                "apply.outcome.final",
                {
                    "error_code": outcome.get("error_code"),
                    "success": outcome.get("success"),
                    "portal": resolved_portal,
                    "block_ads": block_ads,
                },
                application_id=application_id,
            )
            if not outcome.get("success"):
                _attach_apply_diagnostics(
                    diagnostics,
                    portal=resolved_portal,
                    error_code=outcome.get("error_code"),
                )
            return {
                "portal": "browser_use",
                "ats_portal": resolved_portal,
                "session_id": active_session_id,
                "diagnostics": diagnostics,
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

        except PlannerDeadlock as e:
            # Loop watchdog abort: the agent repeated one action past the abort
            # threshold. A fresh attempt (new session, new planner context) is the
            # right recovery — report it as a distinct, retryable failure class.
            logger.error(f"BrowserUseAgent planner deadlock: {e}")
            return {
                "success": False,
                "portal": "browser_use",
                "session_id": active_session_id,
                "error_code": "planner_deadlock",
                "error": str(e),
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
