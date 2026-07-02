"""
Thin REST client for the Browserbase **Agents** platform (hosted agent:
create → run → poll → get result).

This replaces the browser-use + self-managed Browserbase session stack. The agent
loop, the LLM, and the browser session are now all owned by Browserbase — Scout only
creates one reusable agent TEMPLATE (system prompt + result schema) and fires a RUN
per application with per-job `variables` (signed file URLs + the application URL) and a
per-run task string.

Runs are asynchronous: `run_agent` returns a `runId`; poll `get_run` until the status
is terminal (COMPLETED / FAILED / TIMED_OUT / STOPPED), then read `result`.

API shape confirmed against the Scout-Bench/browserbase-agent-workbench reference
implementation. Auth is the `x-bb-api-key` header; base is https://api.browserbase.com/v1.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import requests
import sentry_sdk
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

API_BASE = os.getenv("BROWSERBASE_AGENTS_API_BASE", "https://api.browserbase.com/v1")
BROWSERBASE_API_KEY = os.getenv("BROWSERBASE_API_KEY")

if not BROWSERBASE_API_KEY:
    raise RuntimeError("BROWSERBASE_API_KEY not set")

# Terminal run states — polling stops here. Mirrors the platform lifecycle
# PENDING → RUNNING → COMPLETED | FAILED | TIMED_OUT | STOPPED.
TERMINAL_STATUSES = {"COMPLETED", "FAILED", "TIMED_OUT", "STOPPED"}

# Network timeout for a single control-plane REST call (create/run/get/stop). This is
# NOT the run budget — a run can take many minutes; we poll get_run for that. It only
# bounds one HTTP round-trip so a hung control-plane call can't wedge the worker.
_HTTP_TIMEOUT = 30


class BrowserbaseAgentsClient:
    def __init__(self, api_key: str) -> None:
        self._session = requests.Session()
        self._session.headers.update(
            {"x-bb-api-key": api_key, "Content-Type": "application/json"}
        )

    def create_agent(
        self, *, name: str, system_prompt: str, result_schema: dict[str, Any]
    ) -> dict[str, Any]:
        resp = self._session.post(
            f"{API_BASE}/agents",
            json={
                "name": name,
                "systemPrompt": system_prompt,
                "resultSchema": result_schema,
            },
            timeout=_HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()

    def update_agent(
        self,
        agent_id: str,
        *,
        name: str | None = None,
        system_prompt: str | None = None,
        result_schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        # PATCH is correct: probed live 2026-07-01 — PATCH /agents/{id} exists (returns a
        # real "agent not found" for a bogus id), PUT is a route-level 404. The docs
        # saying PUT are stale; do not "fix" this to match them.
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if system_prompt is not None:
            payload["systemPrompt"] = system_prompt
        if result_schema is not None:
            payload["resultSchema"] = result_schema
        resp = self._session.patch(
            f"{API_BASE}/agents/{agent_id}", json=payload, timeout=_HTTP_TIMEOUT
        )
        resp.raise_for_status()
        return resp.json()

    def run_agent(
        self,
        *,
        task: str,
        agent_id: str | None = None,
        variables: dict[str, dict[str, str]] | None = None,
        result_schema: dict[str, Any] | None = None,
        browser_settings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"task": task}
        if agent_id:
            payload["agentId"] = agent_id
        if variables:
            payload["variables"] = variables
        if result_schema:
            payload["resultSchema"] = result_schema
        if browser_settings:
            payload["browserSettings"] = browser_settings
        resp = self._session.post(
            f"{API_BASE}/agents/runs", json=payload, timeout=_HTTP_TIMEOUT
        )
        if not resp.ok:
            logger.error(
                "run_agent failed (%s): %s",
                resp.status_code,
                resp.text[:1000],
            )
        resp.raise_for_status()
        return resp.json()

    def get_run(self, run_id: str) -> dict[str, Any]:
        resp = self._session.get(
            f"{API_BASE}/agents/runs/{run_id}", timeout=_HTTP_TIMEOUT
        )
        resp.raise_for_status()
        return resp.json()

    def stop_run(self, run_id: str) -> bool:
        """Try to stop a live run server-side; return True only when the run verifiably
        reached a terminal state.

        PLATFORM LIMITATION (probed live 2026-07-01): the Agents API currently has NO
        working stop surface — POST .../stop, POST .../cancel, DELETE, PATCH and PUT on
        the run are all route-level 404s, the run's session is never exposed (no
        sessionId in any run response), and agent sessions are invisible to our project
        on the Sessions API (browserSettings.userMetadata is stripped, GET /sessions
        lists nothing). A live hosted run therefore CANNOT be killed today; it runs to
        its own server-side end. Scout's real cancel guarantee is the control-URL
        check the agent performs before clicking Submit (routes/apply_code.py) — a run
        we abandon aborts at the submit boundary instead of submitting.

        We still attempt the documented route so this starts working the day
        Browserbase ships it, and we report failure LOUDLY (log + Sentry) instead of
        pretending the run was stopped. Never raises — callers (Stop-All, deadline)
        must not fail on a control-plane hiccup — but the return value is honest.
        """
        try:
            # json={} on purpose: the API rejects a bare POST with a JSON content-type
            # header and no body (FST_ERR_CTP_EMPTY_JSON_BODY) before routing.
            resp = self._session.post(
                f"{API_BASE}/agents/runs/{run_id}/stop", json={}, timeout=_HTTP_TIMEOUT
            )
            if resp.ok:
                # Don't trust fire-and-forget: confirm the run actually went terminal.
                for _ in range(7):
                    status = (self.get_run(run_id).get("status") or "").upper()
                    if status in TERMINAL_STATUSES:
                        logger.info("stop_run %s confirmed terminal: %s", run_id, status)
                        return True
                    time.sleep(3)
                logger.error(
                    "stop_run %s: stop call returned %s but the run never reached a "
                    "terminal state within 21s — treating as NOT stopped.",
                    run_id, resp.status_code,
                )
                sentry_sdk.capture_message(
                    "Browserbase stop_run accepted but run did not terminate",
                    level="warning",
                )
                return False
            logger.error(
                "stop_run %s failed: HTTP %s %s — the live Browserbase run KEEPS "
                "RUNNING server-side (platform has no stop surface; the agent's "
                "pre-submit control check is the effective cancel).",
                run_id, resp.status_code, resp.text[:300],
            )
            sentry_sdk.capture_message(
                f"Browserbase stop_run failed (HTTP {resp.status_code}) — "
                "live run not stopped server-side",
                level="warning",
            )
            return False
        except Exception as exc:  # noqa: BLE001
            logger.error("stop_run %s errored: %s", run_id, exc, exc_info=True)
            sentry_sdk.capture_exception(exc)
            return False


_client: BrowserbaseAgentsClient | None = None


def get_client() -> BrowserbaseAgentsClient:
    """Process-wide Agents client (lazy singleton). requests.Session is per-process, so
    this is safe under Celery's process-based pools (prefork/solo)."""
    global _client
    if _client is None:
        _client = BrowserbaseAgentsClient(BROWSERBASE_API_KEY)
    return _client
