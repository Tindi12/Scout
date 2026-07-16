"""
AgentMail inbox-POOL handling: OTP source for the Greenhouse verification
poll-gate, plus recruiter-reply forwarding for everything else.

Greenhouse applies (and ONLY Greenhouse — every other portal submits the user's
real email) list a POOL AgentMail address as the applicant email. The pool
(AGENTMAIL_INBOX_IDS, comma-separated; falls back to the legacy single
AGENTMAIL_INBOX_ID) carries a PER-INBOX verify mutex: each apply claims whichever
inbox is currently free (acquire_pool_inbox), submits THAT address, and releases
it when the run ends — so up to len(pool) Greenhouse verifications run
concurrently, one per inbox, instead of one platform-wide. AgentMail's
`message.received` webhook (routes/webhooks.py) hands each inbound message here
with the receiving inbox resolved from the payload, and it is CLASSIFIED:

  (b) OTP — sender is Greenhouse, an application ASSIGNED TO THE RECEIVING INBOX
      (applications.submitted_email) is parked in awaiting_code with a gate that
      predates the email, and the content yields an 8-char code. The code is
      written to the SAME Redis mailbox apply:code:{application_id} the manual
      CodeModal writes — the /apply-code route and the in-process relay are
      untouched. The OTP email itself is never forwarded; the user instead gets
      ONE short heads-up ("Scout is handling the verification step — ignore
      related mail", no button, no code) per application (_send_otp_notice).
  (b2) PARKED OTP — OTP-SHAPED mail (Greenhouse sender + an anchored code, or
      verification-phrase context + a loose code) that matched no awaiting
      application. Greenhouse
      sends the code email seconds after Submit, routinely BEFORE the agent's first
      code poll stamps the gate — so "no awaiting application" usually means the
      email won the race, not that it's a human message. The code is parked in the
      RECEIVING INBOX's slot apply:ghotp:parked:{inbox} (one slot per inbox is
      safe: the per-inbox verify mutex allows at most one Greenhouse apply per
      inbox at the code stage) for the relay poll to claim. OTP-shaped mail is
      NEVER forwarded — the code is Scout's problem. The user only gets the same
      short heads-up as (b), when company matching attributes the apply
      confidently.
  (c) HUMAN MESSAGE — anything else (recruiter reply, interview request, status
      update). Forwarded to the matched user's REAL email via the existing Resend
      system with Reply-To set to the original sender, plus an in-app notification
      as the backstop. Classification is biased toward (c) EXCEPT for OTP-shaped
      mail (see b2): when in doubt, forward rather than risk swallowing something
      the user needed to see. The only hard drops are OTP-shaped mail, mail not
      addressed to our inbox, and mail we cannot attribute to a single user
      (cross-user misdelivery is worse than a miss — and the in-app path can't
      help there either).

A small POOL of inboxes serves every user (free-tier inbox cap), so attribution
is inbox identity + metadata + timing:
  - OTP: the per-inbox verify mutex (acquire_pool_inbox, taken in
    tasks/job_tasks.py) keeps at most ONE application at the gate PER INBOX, and
    applications.submitted_email records which inbox an apply claimed — matching
    is scoped to the receiving inbox; company-name matching breaks residual ties.
  - Forward: applications.submitted_email records which inbox each relay apply
    used; matching is scoped to the receiving inbox, then company/sender-domain
    picks the application, newest first.

Delivery is push (this webhook) PLUS pull: fetch_code_from_inbox reads the
application's ASSIGNED inbox directly over the AgentMail REST API from inside the
relay's verify poll, covering workers the webhook cannot reach (local dev) and
webhook outages. Both paths claim the same consumed-message marker, so a code is
served exactly once.

Idempotency: OTP consumption claims apply:code:consumed:{message_id}; forwarding
claims apply:forward:{message_id} — a webhook redelivery can neither re-serve a
code nor re-send a forward.

PII posture: message bodies and subjects are searched/forwarded in memory only and
never logged; logs carry message id, sender address, timestamp, and classification
outcome only.
"""
from __future__ import annotations

import html
import json
import logging
import os
import re
import time
from datetime import datetime
from email.utils import getaddresses, parseaddr
from urllib.parse import quote

import requests
from dotenv import load_dotenv

from core.redis_client import (
    CODE_CONSUMED_TTL,
    FORWARDED_MESSAGE_TTL,
    OTP_NOTICE_TTL,
    PENDING_OTP_TTL,
    VERIFICATION_CODE_TTL,
    acquire_gh_verify_mutex,
    code_consumed_key,
    forwarded_message_key,
    gate_key,
    get_redis,
    gh_inbox_scope,
    otp_notice_key,
    pending_otp_key,
    release_gh_verify_mutex,
    verification_code_key,
)
from core.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)

_GREENHOUSE_SENDER_DOMAINS = ("greenhouse.io", "greenhouse-mail.io")

# ── Deterministic code extraction + timestamp parsing ─────────────────────────────
# One code grammar, no LLM: an 8-char case-sensitive token, anchored to the word
# "code"/"verification" when possible, else the first 8-char token mixing letters
# and digits. URLs are stripped first so tracking slugs can't false-positive.
#
# Greenhouse's live template reads "…paste this code into the security code field
# on your application: TCxxxxWw After you enter the code, resubmit your
# application." — the code follows a colon ~50 chars after the anchor word, may be
# LETTERS-ONLY (mixed case, no digits), and the English word "resubmit" sits
# exactly where a naive "8-char token right after 'code'" match looks. Hence:
# a colon-reach anchor, and a code-shape test that rejects English words.
_TAG_RE = re.compile(r"<[^>]+>")
_URL_RE = re.compile(r"https?://\S+")
_COLON_CODE_RE = re.compile(
    r"(?:code|verification)[^:\n]{0,80}:\s*([A-Za-z0-9]{8})\b", re.IGNORECASE
)
_ANCHORED_CODE_RE = re.compile(
    r"(?:code|verification)[^A-Za-z0-9]{0,40}\b([A-Za-z0-9]{8})\b", re.IGNORECASE
)
_TOKEN_RE = re.compile(r"\b[A-Za-z0-9]{8}\b")


def _to_text(raw: str) -> str:
    """HTML → searchable text; URLs removed so tracking slugs can't false-positive."""
    text = html.unescape(_TAG_RE.sub(" ", raw or ""))
    return _URL_RE.sub(" ", text)


def _code_like(token: str, *, anchored: bool) -> bool:
    """Whether a token is plausibly a machine code rather than a word or an id.
    Digits+letters mixed always qualifies. Letters-only qualifies ONLY at an
    anchored position AND only with mixed case beyond a leading capital —
    rejecting prose ('resubmit'), Titlecase words ('Security'), and ALLCAPS,
    while accepting Greenhouse's letters-only codes ('TCxxxxWw'). Anywhere
    else in the mail (the loose layer), letters-only tokens like 'LinkedIn'
    are too word-like to trust. Pure numbers are too URL/id-like everywhere."""
    if any(c.isdigit() for c in token):
        return any(c.isalpha() for c in token)
    if not anchored:
        return False
    return any(c.isupper() for c in token[1:]) and any(c.islower() for c in token)


def _anchored_code(*texts: str) -> str | None:
    """A code-like 8-char token at an anchored position: after 'code'/'verification'
    reaching through a colon (the current Greenhouse template), or directly
    adjacent to the anchor word. Every anchored candidate is shape-tested, so a
    nearby English word can't shadow the real code."""
    cleaned = [_to_text(t) for t in texts if t]
    for regex in (_COLON_CODE_RE, _ANCHORED_CODE_RE):
        for text in cleaned:
            for m in regex.finditer(text):
                if _code_like(m.group(1), anchored=True):
                    return m.group(1)
    return None


def extract_code(*texts: str) -> str | None:
    """Layered deterministic extraction, case preserved:
    1) an anchored code-like token (see _anchored_code);
    2) fallback: the first 8-char token containing at least one digit AND one letter
       (pure words like 'position' can't match; pure numbers are too URL/id-like).
    """
    code = _anchored_code(*texts)
    if code:
        return code
    for text in (_to_text(t) for t in texts if t):
        for token in _TOKEN_RE.findall(text):
            if _code_like(token, anchored=False):
                return token
    return None


def _parse_epoch(value) -> float | None:
    """Tolerant timestamp parse: epoch seconds/ms or ISO-8601 → epoch seconds."""
    if value in (None, ""):
        return None
    try:
        num = float(value)
        return num / 1000.0 if num > 1e12 else num
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None

# How far back forward-matching looks for relay applies. Recruiter replies arrive
# days/weeks after the apply, but an unbounded window makes stale applies compete.
_FORWARD_MATCH_LIMIT = 200


def inbox_pool() -> list[str]:
    """The pool of relay inbox addresses (an AgentMail inbox_id IS the address),
    lowercased, order-preserving, deduped. AGENTMAIL_INBOX_IDS (comma-separated)
    is authoritative; the legacy single AGENTMAIL_INBOX_ID is the fallback so a
    deploy that predates the pool keeps working unchanged."""
    raw = os.getenv("AGENTMAIL_INBOX_IDS", "").strip() or os.getenv(
        "AGENTMAIL_INBOX_ID", ""
    )
    seen: list[str] = []
    for part in raw.split(","):
        addr = part.strip().lower()
        if addr and addr not in seen:
            seen.append(addr)
    return seen


def inbox_address() -> str:
    """The pool's first inbox address — the legacy default for callers that need
    ONE address (never used for assignment; applies claim via acquire_pool_inbox)."""
    pool = inbox_pool()
    return pool[0] if pool else ""


def is_configured() -> bool:
    """Worker-side gate: the applicant-email override + push delivery need only the
    inbox pool (the webhook secret is checked where the webhook lives)."""
    return bool(inbox_pool())


def is_pull_configured() -> bool:
    """The direct-API pull path additionally needs the AgentMail API key."""
    return bool(inbox_pool() and os.getenv("AGENTMAIL_API_KEY", "").strip())


# ── Per-inbox verify locking ───────────────────────────────────────────────────────
# Each pool inbox carries its own mutex (apply:ghverify:inbox:{address}); an apply
# claims the first free inbox and submits that address as the applicant email. Up
# to len(pool) Greenhouse verifications proceed concurrently — a 4th waits exactly
# like the old global mutex (the caller re-queues on None).


def acquire_pool_inbox(token: str) -> str | None:
    """Claim the first currently-free inbox in the pool for this apply attempt.
    Returns the claimed address, or None when every inbox is locked (caller
    re-queues). Inherits acquire_gh_verify_mutex's fail-open posture: on Redis
    errors the first inbox is granted — losing serialization briefly beats
    wedging the apply pipeline."""
    for addr in inbox_pool():
        if acquire_gh_verify_mutex(gh_inbox_scope(addr), token):
            return addr
    return None


def release_pool_inbox(inbox: str, token: str) -> None:
    """Release one claimed inbox (compare-and-delete on the token, so a crashed
    attempt can never free an inbox a later attempt now holds)."""
    release_gh_verify_mutex(gh_inbox_scope(inbox), token)


def _is_greenhouse_sender(addr: str) -> bool:
    domain = addr.rsplit("@", 1)[-1] if "@" in addr else ""
    return any(
        domain == d or domain.endswith("." + d) for d in _GREENHOUSE_SENDER_DOMAINS
    )


def _gate_ts(app: dict) -> float | None:
    """Gate-hit moment for a parked application: the Redis gate flag is authoritative
    (epoch seconds, written at the first code poll); fall back to the DB's
    gate_hit_at ISO stamp if the flag already expired."""
    try:
        raw = get_redis().get(gate_key(app["id"]))
        if raw:
            return float(raw)
    except Exception:  # noqa: BLE001
        pass
    return _parse_epoch(app.get("gate_hit_at"))


# ── (b) OTP consumption ────────────────────────────────────────────────────────────


def _match_awaiting_application(
    msg_ts: float, subject: str, text: str, inbox: str
) -> dict | None:
    """The application this OTP belongs to, or None when nothing (or more than one
    thing) qualifies. Qualifying = ASSIGNED TO THE RECEIVING INBOX (submitted_email
    is stamped with the claimed pool address at apply time) AND awaiting_code AND
    gated BEFORE the email arrived. The per-inbox mutex makes >1 candidate a race
    artifact (mutex fail-open, TTL expiry) rather than the normal case."""
    rows = (
        supabase.table("applications")
        .select("id, user_id, job_id, gate_hit_at")
        .eq("status", "awaiting_code")
        .eq("submitted_email", inbox)
        .not_.is_("gate_hit_at", "null")
        .execute()
        .data
        or []
    )
    candidates = []
    for app in rows:
        gate = _gate_ts(app)
        if gate is not None and msg_ts > gate:
            candidates.append(app)

    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        return None

    # Per-inbox race (mutex fail-open, TTL expiry): try the company name in the
    # email against each candidate's job. Only a UNIQUE hit is trusted.
    job_ids = [a["job_id"] for a in candidates if a.get("job_id")]
    companies: dict[str, str] = {}
    try:
        jobs = (
            supabase.table("jobs")
            .select("id, company")
            .in_("id", job_ids)
            .execute()
            .data
            or []
        )
        companies = {j["id"]: str(j.get("company") or "").strip().lower() for j in jobs}
    except Exception as exc:  # noqa: BLE001
        logger.warning("AgentMail OTP tie-break jobs lookup failed: %s", exc)

    haystack = f"{subject}\n{text}".lower()
    hits = [
        a
        for a in candidates
        if companies.get(a.get("job_id"), "") and companies[a["job_id"]] in haystack
    ]
    if len(hits) == 1:
        return hits[0]
    return None


def _try_consume_otp(
    *, msg_id: str, log_id: str, sender: str, msg_ts: float | None,
    subject: str, text: str, inbox: str,
) -> str | None:
    """Attempt classification (b). Returns the application id the code was delivered
    to, "duplicate" when this message id already served a code (handled — do NOT
    forward a retry of an OTP), or None (not an OTP → caller forwards)."""
    if not _is_greenhouse_sender(sender):
        return None
    if msg_ts is None:
        # Freshness can't be proven — never risk a stale code. Falls through to the
        # forward path, which at worst hands the user the code by email.
        return None

    app = _match_awaiting_application(msg_ts, subject, text, inbox)
    if not app:
        return None

    code = extract_code(subject, text)
    if not code:
        return None

    application_id = app["id"]
    r = get_redis()

    # Idempotency: claim the message id BEFORE delivering (SET NX) so a webhook
    # redelivery — or the same email matched twice — can never serve the code again.
    if msg_id:
        try:
            if not r.set(code_consumed_key(msg_id), "1", nx=True, ex=CODE_CONSUMED_TTL):
                logger.info("AgentMail message %s… already consumed as OTP — skipped", log_id)
                return "duplicate"
        except Exception:  # noqa: BLE001
            pass  # Redis blip: proceed; the mailbox write below is still one-shot per app

    r.setex(verification_code_key(application_id), VERIFICATION_CODE_TTL, code)
    # Mirror the manual /verification-code endpoint: reflect the resume in the tracker
    # immediately instead of waiting for the agent's next poll tick.
    try:
        supabase.table("applications").update(
            {"status": "in_progress", "error_message": None}
        ).eq("id", application_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("AgentMail status flip failed for app %s: %s", application_id, exc)

    logger.info(
        "AgentMail classified message %s… as OTP → application %s (sender %s)",
        log_id, application_id, sender,
    )
    _send_otp_notice(
        application_id=application_id,
        user_id=app.get("user_id"),
        job_id=app.get("job_id"),
    )
    return application_id


def _send_otp_notice(
    *,
    application_id: str,
    user_id: str | None,
    company: str | None = None,
    job_id: str | None = None,
) -> None:
    """One short 'Scout is handling the verification step — ignore related mail'
    heads-up to the user's REAL email, per application per OTP_NOTICE_TTL window.
    The OTP itself never reaches the user (hard policy); this is the reassurance
    that replaces silence. No button, no code content. Best-effort: any failure
    is logged and swallowed — a missed notice must never block code delivery."""
    try:
        if not _claim_otp_notice(application_id):
            return
        if not user_id:
            return

        company_label = (company or "").strip()
        if not company_label and job_id:
            try:
                res = (
                    supabase.table("jobs")
                    .select("company")
                    .eq("id", job_id)
                    .maybe_single()
                    .execute()
                )
                if isinstance(res.data, dict):
                    company_label = str(res.data.get("company") or "").strip()
            except Exception as exc:  # noqa: BLE001
                logger.warning("OTP notice: job lookup failed (app %s): %s", application_id, exc)

        user_row = None
        try:
            res = (
                supabase.table("users")
                .select("email, name")
                .eq("id", user_id)
                .maybe_single()
                .execute()
            )
            user_row = res.data if isinstance(res.data, dict) else None
        except Exception as exc:  # noqa: BLE001
            logger.warning("OTP notice: user lookup failed (app %s): %s", application_id, exc)

        real_email = (user_row or {}).get("email") or ""
        if real_email.strip().lower() in inbox_pool():
            return  # never mail a relay inbox itself

        from core.email import first_name_from, send_otp_notice_email

        sent = send_otp_notice_email(
            to=real_email,
            user_id=user_id,
            first_name=first_name_from((user_row or {}).get("name")),
            company=company_label or None,
        )
        logger.info(
            "OTP notice for application %s: email_sent=%s", application_id, sent
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("OTP notice failed for application %s: %s", application_id, exc)


def _claim_otp_notice(application_id: str) -> bool:
    """SET NX claim on the per-application notice marker. A Redis blip claims
    False — skipping a heads-up beats a mail flood when Redis is flapping."""
    try:
        return bool(
            get_redis().set(
                otp_notice_key(application_id), "1", nx=True, ex=OTP_NOTICE_TTL
            )
        )
    except Exception:  # noqa: BLE001
        return False


# Phrases that mark a Greenhouse email as a verification/OTP email even when the
# code isn't directly adjacent to the word 'code' (e.g. "your verification code
# is XXXXXXXX" — the word 'is' breaks the anchored regex).
_OTP_CONTEXT_RE = re.compile(
    r"verification code|security code|verify your (?:application|email)"
    r"|confirm (?:that )?you(?: a|')re? (?:a )?human|enter (?:this|the) code",
    re.IGNORECASE,
)


def _otp_shaped_code(subject: str, text: str) -> str | None:
    """The OTP signature for parking: an anchored code-like token (see
    _anchored_code), OR — when the email clearly reads as a verification
    email (_OTP_CONTEXT_RE) — extract_code's loose token fallback. Recruiter
    replies also arrive from greenhouse-mail.io, so a bare 8-char token alone
    must never suppress mail; it needs the verification-phrase context."""
    code = _anchored_code(subject, text)
    if code:
        return code
    haystack = f"{_to_text(subject)}\n{_to_text(text)}"
    if _OTP_CONTEXT_RE.search(haystack):
        return extract_code(subject, text)
    return None


def _park_otp(
    *, msg_id: str, log_id: str, sender: str, msg_ts: float | None, code: str,
    inbox: str, subject: str = "", text: str = "",
) -> None:
    """Classification (b2): an OTP-shaped email that matched no awaiting
    application — almost always the submit→gate race (Greenhouse's code email
    beats the agent's first poll). Park the code in the RECEIVING INBOX's slot
    for the relay to claim (the agent looks up its assigned inbox and reads the
    same slot). Best-effort: a Redis blip just lets the parked code expire
    unclaimed; the mail is suppressed from the user either way."""
    r = get_redis()
    if msg_id:
        try:
            if not r.set(code_consumed_key(msg_id), "1", nx=True, ex=CODE_CONSUMED_TTL):
                logger.info("AgentMail message %s… already consumed as OTP — skipped", log_id)
                return
        except Exception:  # noqa: BLE001
            pass
    try:
        r.setex(
            pending_otp_key(inbox),
            PENDING_OTP_TTL,
            json.dumps({"code": code, "ts": msg_ts or time.time()}),
        )
        logger.info(
            "AgentMail classified message %s… as OTP (no gate yet) → parked for "
            "inbox %s (sender %s)",
            log_id, inbox, sender,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("AgentMail OTP park failed for message %s…: %s", log_id, exc)

    # Heads-up to the user whose apply this is. No gate stamp yet, so attribute
    # the same way forwards do (company match against this inbox's relay applies)
    # — a unique hit sends the notice, anything ambiguous stays silent.
    app = _match_forward_target(sender, subject, text, inbox)
    if app:
        _send_otp_notice(
            application_id=app["id"],
            user_id=app.get("user_id"),
            company=app.get("company"),
        )


# ── PULL path: direct inbox read for the verify gate ────────────────────────────────
# The webhook is push-only and needs a publicly reachable API: on a local dev worker
# (or any webhook misconfiguration/outage) the code email lands in the inbox and
# nobody delivers it. fetch_code_from_inbox is the worker's own pull — wired as the
# relay's fetch_code hook, polled every ~15s inside the verify window. Push and pull
# share the consumed-message marker, so whichever wins serves the code exactly once.

_API_BASE = os.getenv("AGENTMAIL_API_BASE", "https://api.agentmail.to").rstrip("/")
_PULL_HTTP_TIMEOUT = 10  # seconds per AgentMail API call
_PULL_LIST_LIMIT = 10  # newest messages scanned per poll
# The code email routinely arrives BEFORE the agent's first poll stamps the gate
# (submit → email is seconds; submit → first poll can be a minute+), so accept
# messages this far before the gate stamp.
_PULL_GATE_SKEW = 300.0  # seconds


def fetch_code_from_inbox(
    gate_ts: float,
    application_id: str | None = None,
    inbox: str | None = None,
) -> str | None:
    """Pull the newest Greenhouse OTP for the application currently at the gate,
    from the application's ASSIGNED pool inbox.

    Safe to bind to a single application without the webhook's awaiting_code
    matching: the per-inbox verify mutex allows at most ONE Greenhouse apply at
    the code stage per inbox, so any fresh Greenhouse OTP in the caller's
    assigned inbox belongs to the caller. Freshness = message timestamp within
    _PULL_GATE_SKEW of the gate stamp or later. Idempotency: claims the same
    apply:code:consumed:{message_id} marker the webhook claims, so push and pull
    can never both serve one email. Returns the code or None; never raises.
    PII posture matches the webhook path: bodies are searched in memory only.
    """
    api_key = os.getenv("AGENTMAIL_API_KEY", "").strip()
    inbox = (inbox or "").strip().lower() or inbox_address()
    if not api_key or not inbox:
        return None

    headers = {"Authorization": f"Bearer {api_key}"}
    messages_url = f"{_API_BASE}/v0/inboxes/{quote(inbox)}/messages"
    try:
        resp = requests.get(
            messages_url,
            headers=headers,
            # include_spam: verification mail is exactly the kind of automated
            # send that trips spam filters, and the Greenhouse-sender + OTP-shape
            # checks below make a spam-folder read safe.
            params={"limit": _PULL_LIST_LIMIT, "include_spam": "true"},
            timeout=_PULL_HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        messages = (resp.json() or {}).get("messages") or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("AgentMail pull: message list failed: %s", exc)
        return None

    r = get_redis()
    for msg in messages:  # newest first
        _, sender = parseaddr(str(msg.get("from") or ""))
        sender = sender.strip().lower()
        if not _is_greenhouse_sender(sender):
            continue
        msg_ts = _parse_epoch(msg.get("timestamp"))
        if msg_ts is None or msg_ts < gate_ts - _PULL_GATE_SKEW:
            continue
        msg_id = str(msg.get("message_id") or "")
        log_id = msg_id[:24]
        if msg_id:
            try:
                if r.get(code_consumed_key(msg_id)):
                    continue  # already served (webhook or an earlier poll)
            except Exception:  # noqa: BLE001
                pass

        subject = str(msg.get("subject") or "")
        text = str(msg.get("preview") or "")
        if msg_id:
            try:
                detail = requests.get(
                    f"{messages_url}/{quote(msg_id)}",
                    headers=headers,
                    timeout=_PULL_HTTP_TIMEOUT,
                )
                detail.raise_for_status()
                d = detail.json() or {}
                subject = str(d.get("subject") or "") or subject
                text = str(d.get("text") or "") or str(d.get("html") or "") or text
            except Exception as exc:  # noqa: BLE001
                # The list preview often carries the code — keep going with it.
                logger.warning(
                    "AgentMail pull: message %s… fetch failed (using preview): %s",
                    log_id, exc,
                )

        code = _otp_shaped_code(subject, text)
        if not code:
            continue

        if msg_id:
            try:
                if not r.set(
                    code_consumed_key(msg_id), "1", nx=True, ex=CODE_CONSUMED_TTL
                ):
                    continue  # push path won the race on this exact message
            except Exception:  # noqa: BLE001
                pass  # Redis blip: serving the code beats stalling the gate

        logger.info(
            "AgentMail pull: verification code retrieved from message %s… (sender %s)",
            log_id, sender,
        )
        if application_id:
            app_row = None
            try:
                res = (
                    supabase.table("applications")
                    .select("user_id, company")
                    .eq("id", application_id)
                    .maybe_single()
                    .execute()
                )
                app_row = res.data if isinstance(res.data, dict) else None
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "AgentMail pull: app lookup for notice failed (app %s): %s",
                    application_id, exc,
                )
            if app_row:
                _send_otp_notice(
                    application_id=application_id,
                    user_id=app_row.get("user_id"),
                    company=app_row.get("company"),
                )
        return code
    return None


# ── (c) Human-message forwarding ───────────────────────────────────────────────────


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _match_forward_target(
    sender: str, subject: str, text: str, inbox: str
) -> dict | None:
    """The application (and thus user) a human message belongs to.

    Candidates are applies that used the RECEIVING inbox's address as applicant
    email (applications.submitted_email — replies land at the address that was
    submitted; falls back to Greenhouse-URL applies while that migration is
    fresh), newest first. A company-name hit (in the sender's address/display,
    subject, or body) picks the newest matching apply; with no company signal,
    the message is only attributed when every candidate belongs to ONE user —
    never guessed across users, because misdelivering recruiter mail is worse
    than dropping it."""
    fields = "id, user_id, company, role, created_at"
    rows: list[dict] = []
    try:
        rows = (
            supabase.table("applications")
            .select(fields)
            .eq("submitted_email", inbox)
            .order("created_at", desc=True)
            .limit(_FORWARD_MATCH_LIMIT)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("AgentMail forward match: submitted_email lookup failed: %s", exc)
    if not rows:
        # Legacy/pre-migration relay applies carry no marker; Greenhouse-by-URL is
        # the closest superset (mail reaching our inbox can only be a relay apply).
        try:
            rows = (
                supabase.table("applications")
                .select(fields)
                .ilike("url", "%greenhouse%")
                .order("created_at", desc=True)
                .limit(_FORWARD_MATCH_LIMIT)
                .execute()
                .data
                or []
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("AgentMail forward match: fallback lookup failed: %s", exc)
            return None
    if not rows:
        return None

    haystack = f"{sender}\n{subject}\n{text[:5000]}".lower()
    sender_domain_norm = _norm(sender.rsplit("@", 1)[-1] if "@" in sender else "")
    for app in rows:  # newest first — first hit wins
        company = str(app.get("company") or "").strip().lower()
        if not company:
            continue
        if company in haystack or (
            len(_norm(company)) >= 4 and _norm(company) in sender_domain_norm
        ):
            return app

    users = {a["user_id"] for a in rows if a.get("user_id")}
    if len(users) == 1:
        return rows[0]
    return None


def _forward_human_message(
    *, msg_id: str, log_id: str, sender: str, sender_raw: str,
    subject: str, text: str, inbox: str,
) -> str | None:
    """Classification (c): forward to the matched user's real email (Reply-To = the
    recruiter) and surface in-app. Returns the application id, or None on no-match/
    duplicate. Send failures are non-fatal — the in-app notification is created
    FIRST, so nothing is lost when Resend is down."""
    app = _match_forward_target(sender, subject, text, inbox)
    if not app:
        logger.info(
            "AgentMail message %s… (sender %s): human message but no attributable "
            "user — dropped (nothing to safely forward to)",
            log_id, sender,
        )
        return None

    # Idempotency: claim the message id before any side effect — a Svix redelivery
    # must not duplicate the notification or the email.
    if msg_id:
        try:
            if not get_redis().set(
                forwarded_message_key(msg_id), "1", nx=True, ex=FORWARDED_MESSAGE_TTL
            ):
                logger.info("AgentMail message %s… already forwarded — skipped", log_id)
                return None
        except Exception:  # noqa: BLE001
            pass  # Redis blip: a rare duplicate forward beats a swallowed message

    application_id = app["id"]
    user_id = app["user_id"]
    company = str(app.get("company") or "").strip() or "An employer"
    role = str(app.get("role") or "").strip() or "your application"

    # In-app backstop BEFORE the email so a Resend outage can't lose the message.
    # Deferred import keeps core/ → services/ coupling out of module import time.
    from services.notification_service import create_notification

    preview = " ".join(text.split())[:300] or subject[:300]
    in_app = None
    try:
        in_app = create_notification(
            user_id,
            "application_response",
            f"{company} responded — {role}",
            preview or None,
            application_id=application_id,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("AgentMail in-app notification failed (app %s): %s", application_id, exc)

    user_row = None
    try:
        res = (
            supabase.table("users")
            .select("email, name")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        user_row = res.data if isinstance(res.data, dict) else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("AgentMail forward: user lookup failed (app %s): %s", application_id, exc)

    real_email = (user_row or {}).get("email") or ""
    if real_email.strip().lower() in inbox_pool():
        real_email = ""  # never forward the relay back to itself

    from core.email import first_name_from, send_recruiter_forward_email

    body = text.strip() or subject
    sent = send_recruiter_forward_email(
        to=real_email,
        user_id=user_id,
        first_name=first_name_from((user_row or {}).get("name")),
        company=company,
        recruiter_from=sender_raw or sender,
        reply_to=sender,
        message_text=body,
    )
    logger.info(
        "AgentMail classified message %s… as human → application %s "
        "(sender %s, email_sent=%s, in_app=%s)",
        log_id, application_id, sender, sent, bool(in_app),
    )
    return application_id


# ── Entry point ────────────────────────────────────────────────────────────────────


def handle_inbound_message(message: dict) -> str:
    """Classify and route one verified `message.received` payload. Returns a short
    outcome tag for the webhook response/logs. Never raises for a non-match — only
    for transient infra failures, which the webhook converts to a retryable 500."""
    msg_id = str(message.get("message_id") or "")
    sender_raw = str(message.get("from") or "")
    _, sender = parseaddr(sender_raw)
    sender = sender.strip().lower()
    msg_ts = _parse_epoch(message.get("timestamp"))
    log_id = msg_id[:24]

    # Resolve WHICH pool inbox received this message — every downstream step
    # (awaiting-app match, parked-OTP slot, forward match) is scoped to it.
    # AgentMail stamps inbox_id on the payload (authoritative); the To: header is
    # the fallback for older payload shapes. Hard recipient pin: mail that
    # resolves to no pool inbox drives nothing (AgentMail scopes webhooks per
    # inbox, but config can drift).
    pool = inbox_pool()
    inbox = str(message.get("inbox_id") or "").strip().lower()
    if inbox not in pool:
        to_field = message.get("to") or []
        if isinstance(to_field, str):
            to_field = [to_field]
        recipients = {a.lower() for _, a in getaddresses([str(t) for t in to_field]) if a}
        inbox = next((a for a in pool if a in recipients), "")
    if not inbox:
        logger.info("AgentMail message %s…: not addressed to an apply inbox — skipped", log_id)
        return "skipped:wrong_recipient"

    # A message id that already served a code must short-circuit BEFORE
    # classification: once the OTP is consumed the application leaves
    # awaiting_code, so a redelivery would no longer match as an OTP and would
    # fall through to the forward path — mailing the user a code Scout already
    # used. Consumed means handled, whatever the current application state.
    if msg_id:
        try:
            if get_redis().get(code_consumed_key(msg_id)):
                logger.info(
                    "AgentMail message %s… already consumed as OTP — skipped", log_id
                )
                return "otp:duplicate"
        except Exception:  # noqa: BLE001
            pass

    subject = str(message.get("subject") or "")
    text = str(message.get("text") or "")
    if not text.strip():
        # Some senders ship an HTML-only body — Greenhouse's OTP template among
        # them (the code appears ONLY in `html`). Strip tags but keep URLs: the
        # extraction layers re-run _to_text (which drops URLs) themselves, while
        # the forward path needs any links the sender included.
        text = html.unescape(_TAG_RE.sub(" ", str(message.get("html") or "")))

    otp_result = _try_consume_otp(
        msg_id=msg_id, log_id=log_id, sender=sender, msg_ts=msg_ts,
        subject=subject, text=text, inbox=inbox,
    )
    if otp_result == "duplicate":
        return "otp:duplicate"
    if otp_result:
        return f"otp:{otp_result}"

    # (b2) OTP-shaped but unmatched: the code email beat the gate stamp (or the
    # gate state was unreadable). Park it for the relay and suppress it — OTP
    # noise must NEVER reach the user as a "company responded" forward.
    if _is_greenhouse_sender(sender):
        code = _otp_shaped_code(subject, text)
        if code:
            _park_otp(
                msg_id=msg_id, log_id=log_id, sender=sender, msg_ts=msg_ts, code=code,
                inbox=inbox, subject=subject, text=text,
            )
            return "otp:parked"

    forwarded_to = _forward_human_message(
        msg_id=msg_id, log_id=log_id, sender=sender, sender_raw=sender_raw,
        subject=subject, text=text, inbox=inbox,
    )
    return f"forwarded:{forwarded_to}" if forwarded_to else "skipped:no_match"
