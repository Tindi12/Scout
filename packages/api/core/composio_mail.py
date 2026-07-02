"""
Composio-managed, READ-ONLY mailbox access for ATS verification codes.

Scout never stores mail OAuth tokens — Composio holds them (managed auth). Connections
are keyed to the user's CLERK id (Composio `user_id`), one auth config per provider:
Gmail (scope gmail.readonly) and Outlook (scope Mail.Read), pre-configured in the
Composio dashboard and referenced by env ids.

The fetch path is DETERMINISTIC — a search/fetch tool call plus a regex. No LLM ever
sees mailbox content, and only read/search tool slugs are callable (hard allowlist).
The extracted artifact is a single 8-character, case-sensitive code; message bodies are
never logged and never persisted.

Env (checked lazily so environments without the feature still boot):
  COMPOSIO_API_KEY                 — project API key
  COMPOSIO_GMAIL_AUTH_CONFIG_ID    — managed Gmail auth config (gmail.readonly)
  COMPOSIO_OUTLOOK_AUTH_CONFIG_ID  — managed Outlook auth config (Mail.Read)
"""
from __future__ import annotations

import html
import logging
import os
import re
from datetime import datetime, timezone

from dotenv import load_dotenv

from core.redis_client import CODE_CONSUMED_TTL, code_consumed_key, get_redis

load_dotenv()

logger = logging.getLogger(__name__)

# provider value stored on users.mail_provider
PROVIDER_GOOGLE = "google"
PROVIDER_MICROSOFT = "microsoft"

_AUTH_CONFIG_ENVS = {
    PROVIDER_GOOGLE: "COMPOSIO_GMAIL_AUTH_CONFIG_ID",
    PROVIDER_MICROSOFT: "COMPOSIO_OUTLOOK_AUTH_CONFIG_ID",
}

# The ONLY tool slugs this module may execute — read/search only, enforced at the
# single execute seam below. Never add send/delete/modify/draft slugs here.
_READ_ONLY_SLUGS = {
    "GMAIL_FETCH_EMAILS",
    "GMAIL_GET_PROFILE",
    "OUTLOOK_OUTLOOK_LIST_MESSAGES",
    "OUTLOOK_OUTLOOK_GET_PROFILE",
}

_client = None


def is_configured() -> bool:
    return bool(os.getenv("COMPOSIO_API_KEY"))


def _get_client():
    """Lazy singleton. Raises RuntimeError when the feature isn't configured — callers
    treat that as 'auto-fetch unavailable' and fall back to the manual code path."""
    global _client
    if _client is None:
        api_key = os.getenv("COMPOSIO_API_KEY")
        if not api_key:
            raise RuntimeError("COMPOSIO_API_KEY not set — mail auto-fetch disabled")
        from composio import Composio  # deferred: import cost only when used

        _client = Composio(api_key=api_key)
    return _client


def _auth_config_id(provider: str) -> str:
    env = _AUTH_CONFIG_ENVS.get(provider)
    if not env:
        raise ValueError(f"Unknown mail provider: {provider!r}")
    value = os.getenv(env, "").strip()
    if not value:
        raise RuntimeError(f"{env} not set — cannot use provider {provider!r}")
    return value


def _execute(slug: str, *, user_id: str, arguments: dict) -> dict:
    """Single execution seam with the read-only allowlist. Returns the tool's `data`
    dict ({} on unsuccessful executions, logged without content)."""
    if slug not in _READ_ONLY_SLUGS:
        raise ValueError(f"Tool {slug} is not on the read-only allowlist")
    resp = _get_client().tools.execute(slug, arguments, user_id=user_id)
    # ToolExecutionResponse is dict-like: {successful, data, error}
    successful = bool(resp.get("successful", False)) if hasattr(resp, "get") else False
    if not successful:
        err = resp.get("error") if hasattr(resp, "get") else None
        logger.warning("Composio %s unsuccessful: %s", slug, str(err)[:200])
        return {}
    data = resp.get("data") if hasattr(resp, "get") else None
    return data if isinstance(data, dict) else {}


# ── Connection lifecycle (used by routes/user.py) ─────────────────────────────────────

def initiate_connection(clerk_user_id: str, provider: str, callback_url: str | None) -> dict:
    """Start Composio's hosted OAuth for the provider. Returns the URL to send the
    user to plus the pending connected-account id.

    Uses connected_accounts.link (POST /api/v3/connected_accounts/link) — Composio
    removed initiate() support for Composio-managed OAuth auth configs (their 400
    explicitly says to use link instead)."""
    req = _get_client().connected_accounts.link(
        user_id=clerk_user_id,
        auth_config_id=_auth_config_id(provider),
        callback_url=callback_url,
    )
    return {"redirect_url": req.redirect_url, "connection_id": req.id}


def get_connection_status(connection_id: str) -> str:
    """Composio connection status: INITIALIZING/INITIATED/ACTIVE/FAILED/EXPIRED/..."""
    account = _get_client().connected_accounts.get(connection_id)
    return getattr(account, "status", "") or ""


def disconnect(connection_id: str) -> None:
    _get_client().connected_accounts.delete(connection_id)


def fetch_mailbox_address(clerk_user_id: str, provider: str) -> str | None:
    """The connected mailbox's own address (to show in settings and to detect the
    applicant-email-mismatch fallback case). Best-effort — None on any failure."""
    try:
        if provider == PROVIDER_GOOGLE:
            data = _execute("GMAIL_GET_PROFILE", user_id=clerk_user_id, arguments={})
            addr = data.get("emailAddress") or (data.get("response_data") or {}).get("emailAddress")
        else:
            data = _execute(
                "OUTLOOK_OUTLOOK_GET_PROFILE", user_id=clerk_user_id, arguments={}
            )
            addr = data.get("mail") or data.get("userPrincipalName")
        return str(addr).strip().lower() if addr else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("fetch_mailbox_address failed (%s): %s", provider, exc)
        return None


# ── Verification-code fetch (deterministic, no LLM) ───────────────────────────────────

_TAG_RE = re.compile(r"<[^>]+>")
_URL_RE = re.compile(r"https?://\S+")
# A code mentioned near the words "code"/"verification" — captures preserve case.
_ANCHORED_CODE_RE = re.compile(
    r"(?:code|verification)[^A-Za-z0-9]{0,40}\b([A-Za-z0-9]{8})\b", re.IGNORECASE
)
_TOKEN_RE = re.compile(r"\b[A-Za-z0-9]{8}\b")


def _to_text(raw: str) -> str:
    """HTML → searchable text; URLs removed so tracking slugs can't false-positive."""
    text = html.unescape(_TAG_RE.sub(" ", raw or ""))
    return _URL_RE.sub(" ", text)


def extract_code(*texts: str) -> str | None:
    """Layered deterministic extraction, case preserved:
    1) an 8-char token anchored to the word 'code'/'verification';
    2) fallback: the first 8-char token containing at least one digit AND one letter
       (pure words like 'position' can't match; pure numbers are too URL/id-like).
    """
    cleaned = [_to_text(t) for t in texts if t]
    for text in cleaned:
        m = _ANCHORED_CODE_RE.search(text)
        if m:
            return m.group(1)
    for text in cleaned:
        for token in _TOKEN_RE.findall(text):
            if any(c.isdigit() for c in token) and any(c.isalpha() for c in token):
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


def _gmail_candidates(clerk_user_id: str) -> list[dict]:
    data = _execute(
        "GMAIL_FETCH_EMAILS",
        user_id=clerk_user_id,
        arguments={
            # Greenhouse sends codes from no-reply@greenhouse.io; keep the query loose
            # on the local part but pinned to the domain, and recent.
            "query": "from:(greenhouse.io) newer_than:1h",
            "max_results": 10,
            "include_payload": True,
        },
    )
    messages = data.get("messages") or data.get("emails") or []
    out = []
    for m in messages if isinstance(messages, list) else []:
        if not isinstance(m, dict):
            continue
        out.append({
            "id": str(m.get("messageId") or m.get("id") or ""),
            "ts": _parse_epoch(
                m.get("messageTimestamp") or m.get("internalDate") or m.get("date")
            ),
            "texts": [
                str(m.get("subject") or ""),
                str(m.get("messageText") or ""),
                str(m.get("snippet") or m.get("preview") or ""),
                str(m.get("messageBody") or m.get("body") or ""),
            ],
        })
    return out


def _outlook_candidates(clerk_user_id: str, since_epoch: float) -> list[dict]:
    since_iso = datetime.fromtimestamp(since_epoch, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    data = _execute(
        "OUTLOOK_OUTLOOK_LIST_MESSAGES",
        user_id=clerk_user_id,
        arguments={
            "folder": "inbox",
            "top": 10,
            "filter": (
                f"receivedDateTime ge {since_iso} and "
                "contains(from/emailAddress/address,'greenhouse')"
            ),
        },
    )
    messages = data.get("value") or data.get("messages") or []
    out = []
    for m in messages if isinstance(messages, list) else []:
        if not isinstance(m, dict):
            continue
        body = m.get("body") or {}
        out.append({
            "id": str(m.get("id") or ""),
            "ts": _parse_epoch(m.get("receivedDateTime")),
            "texts": [
                str(m.get("subject") or ""),
                str(m.get("bodyPreview") or ""),
                str(body.get("content") or "") if isinstance(body, dict) else "",
            ],
        })
    return out


def fetch_verification_code(
    clerk_user_id: str, provider: str, since_epoch: float
) -> str | None:
    """One deterministic fetch attempt: newest qualifying Greenhouse email received
    AFTER `since_epoch` (the gate-hit moment — never a stale code from an earlier
    application), not already consumed. Marks the source message consumed on success.
    Returns the code with case intact, or None (caller retries on its cadence)."""
    try:
        if provider == PROVIDER_MICROSOFT:
            candidates = _outlook_candidates(clerk_user_id, since_epoch)
        else:
            candidates = _gmail_candidates(clerk_user_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Verification-code fetch failed (%s): %s", provider, exc)
        return None

    redis_client = get_redis()
    # Newest first; unknown timestamps sort last but are still considered.
    candidates.sort(key=lambda c: c["ts"] or 0, reverse=True)
    for cand in candidates:
        ts = cand["ts"]
        if ts is not None and ts <= since_epoch:
            continue  # predates the gate — a previous application's code
        msg_id = cand["id"]
        if msg_id:
            try:
                if redis_client.get(code_consumed_key(msg_id)):
                    continue
            except Exception:
                pass  # Redis blip: proceed, serialization mutex still protects us
        code = extract_code(*cand["texts"])
        if not code:
            continue
        if msg_id:
            try:
                redis_client.setex(code_consumed_key(msg_id), CODE_CONSUMED_TTL, "1")
            except Exception:
                pass
        logger.info("Verification code extracted from message %s…", msg_id[:12])
        return code
    return None
