"""Deterministic required-field inventory and post-submit page classification.

Used by the browser-use apply engine's pre_submit_check / post_submit_check
tools. Pure-Python evaluators are unit-testable without CDP; the JS scanners
run in-page via Runtime.evaluate.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Literal

# Placeholders that look "filled" but are not committed applicant answers.
_PLACEHOLDER_TOKENS = frozenset({
    "",
    "select",
    "select...",
    "select one",
    "choose",
    "choose one",
    "please select",
    "n/a",
    "-",
    "--",
})

PostSubmitClassification = Literal[
    "confirmed",
    "spam_blocked",
    "validation_errors",
    "verification_gate",
    "captcha",
    "still_on_form",
    "unconfirmed",
]

# Same-origin frame walk + conservative required-field inventory. Never returns
# field VALUES — only presence flags and short fingerprints for fixed-point
# comparison. File inputs that are 1px / tabindex=-1 but labeled Resume* are
# INCLUDED (Ashby), while honeypot-named / display:none traps are EXCLUDED.
_JS_SCAN_REQUIRED_FIELDS = r"""
(() => {
  const PLACEHOLDERS = new Set([
    "", "select", "select...", "select one", "choose", "choose one",
    "please select", "n/a", "-", "--",
  ]);

  function visibleLikeHuman(el) {
    if (!el || !(el instanceof Element)) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") {
      return false;
    }
    if (parseFloat(cs.opacity || "1") <= 0.05) return false;
    const r = el.getBoundingClientRect();
    const leftCss = parseFloat(cs.left);
    const topCss = parseFloat(cs.top);
    const indent = parseFloat(cs.textIndent);
    if (
      r.left <= -1000 || r.top <= -1000 ||
      Math.abs(leftCss) >= 9000 || Math.abs(topCss) >= 9000 || Math.abs(indent) >= 9000
    ) {
      return false;
    }
    return true;
  }

  function labelFor(el) {
    let text = "";
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) text = (lab.innerText || lab.textContent || "").trim();
    }
    if (!text) {
      const parentLab = el.closest("label");
      if (parentLab) text = (parentLab.innerText || parentLab.textContent || "").trim();
    }
    if (!text) {
      text = (
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.getAttribute("name") ||
        el.id ||
        ""
      ).trim();
    }
    return String(text).replace(/\s+/g, " ").slice(0, 80);
  }

  function looksRequired(el, label) {
    if (el.required || el.getAttribute("aria-required") === "true") return "native_required";
    if (/\*\s*$/.test(label) || /\brequired\b/i.test(label)) return "label_marker";
    const fs = el.closest("fieldset");
    if (fs && (fs.required || fs.getAttribute("aria-required") === "true")) {
      return "fieldset_required";
    }
    return null;
  }

  function isHoneypot(el, label) {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "hidden") return true;
    const name = ((el.getAttribute("name") || el.id || "") + " " + label).toLowerCase();
    const honeypotTokens = ["website", "url2", "fax", "company_url", "honeypot", "botfield"];
    const cs = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const tiny = r.width <= 1 || r.height <= 1;
    const ariaHidden = el.getAttribute("aria-hidden") === "true" || !!el.closest('[aria-hidden="true"]');
    const tabNeg = el.getAttribute("tabindex") === "-1";
    // Ashby resume: tiny + tabindex=-1 but REQUIRED and labeled Resume*
    if ((/resume|cv|curriculum/i.test(label) || /resume|cv/i.test(name)) && type === "file") {
      return false;
    }
    if (cs.display === "none" || cs.visibility === "hidden") return true;
    if (tiny && !(type === "file" && el.required)) return true;
    if (honeypotTokens.some((t) => name.includes(t)) && (tiny || ariaHidden || tabNeg)) {
      return true;
    }
    return false;
  }

  function fingerprint(value) {
    const v = String(value || "").trim().toLowerCase();
    if (!v || PLACEHOLDERS.has(v)) return null;
    let h = 0;
    for (let i = 0; i < v.length; i++) h = ((h << 5) - h + v.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).slice(0, 12);
  }

  function isSatisfiedText(el) {
    const v = String(el.value || "").trim().toLowerCase();
    return !!v && !PLACEHOLDERS.has(v);
  }

  function isSatisfiedSelect(el) {
    if (!el.options || el.selectedIndex < 0) return false;
    const opt = el.options[el.selectedIndex];
    const v = String(opt?.value || "").trim().toLowerCase();
    const t = String(opt?.text || "").trim().toLowerCase();
    if (!v && !t) return false;
    return !PLACEHOLDERS.has(v) && !PLACEHOLDERS.has(t);
  }

  function collectFromDoc(doc, frameId, out) {
    const controls = doc.querySelectorAll(
      "input, textarea, select, [role='combobox'], [role='radiogroup']"
    );
    const seenRadio = new Set();
    const seenCheckboxGroup = new Set();

    for (const el of controls) {
      if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
      const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
      const label = labelFor(el);

      if (type === "radio") {
        const name = el.getAttribute("name") || label || el.id || "radio";
        if (seenRadio.has(name)) continue;
        seenRadio.add(name);
        const group = doc.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`);
        const first = group[0] || el;
        const req = looksRequired(first, label) || (
          first.closest('[role="radiogroup"][aria-required="true"]') ? "aria_required" : null
        ) || (
          first.closest("fieldset[required], fieldset[aria-required='true']") ? "fieldset_required" : null
        );
        if (!req) continue;
        if (isHoneypot(first, label)) continue;
        let anyVisible = false;
        let checked = false;
        for (const r of group) {
          if (visibleLikeHuman(r) || r.required) anyVisible = true;
          if (r.checked) checked = true;
        }
        if (!anyVisible) continue;
        out.push({
          key: `${frameId}:radio:${name}`,
          kind: "radio_group",
          label: label.slice(0, 80) || name.slice(0, 80),
          requiredReason: req,
          satisfied: checked,
          valuePresent: checked,
          valueFingerprint: checked ? "checked" : null,
          groupKey: name,
          domHint: name,
        });
        continue;
      }

      if (type === "checkbox") {
        const req = looksRequired(el, label);
        if (!req) continue;
        if (isHoneypot(el, label)) continue;
        if (!visibleLikeHuman(el) && !el.required) continue;
        const name = el.getAttribute("name") || el.id || label;
        if (seenCheckboxGroup.has(name) && !el.required) continue;
        seenCheckboxGroup.add(name);
        out.push({
          key: `${frameId}:checkbox:${name}:${el.id || ""}`,
          kind: "checkbox_group",
          label: label.slice(0, 80),
          requiredReason: req,
          satisfied: !!el.checked,
          valuePresent: !!el.checked,
          valueFingerprint: el.checked ? "checked" : null,
          groupKey: name,
          domHint: name,
        });
        continue;
      }

      if (el.getAttribute("role") === "radiogroup") {
        const req = el.getAttribute("aria-required") === "true" ? "aria_required" : looksRequired(el, label);
        if (!req) continue;
        if (!visibleLikeHuman(el)) continue;
        const radios = el.querySelectorAll('[role="radio"], input[type="radio"]');
        let checked = false;
        for (const r of radios) {
          if (r.getAttribute("aria-checked") === "true" || r.checked) checked = true;
        }
        const key = `${frameId}:radiogroup:${el.id || label}`;
        out.push({
          key,
          kind: "radio_group",
          label: label.slice(0, 80),
          requiredReason: req,
          satisfied: checked,
          valuePresent: checked,
          valueFingerprint: checked ? "checked" : null,
          groupKey: el.id || label,
          domHint: el.id || label.slice(0, 40),
        });
        continue;
      }

      if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete")) {
        const req = looksRequired(el, label) || (
          el.getAttribute("aria-required") === "true" ? "aria_required" : null
        );
        if (!req) continue;
        if (isHoneypot(el, label)) continue;
        if (!visibleLikeHuman(el) && !el.required) continue;
        const raw = el.value != null ? el.value : (el.textContent || "");
        const fp = fingerprint(raw);
        const hasActive = !!el.getAttribute("aria-activedescendant");
        const satisfied = !!fp || hasActive;
        out.push({
          key: `${frameId}:combobox:${el.id || el.getAttribute("name") || label}`,
          kind: "combobox",
          label: label.slice(0, 80),
          requiredReason: req === true ? "aria_required" : req,
          satisfied,
          valuePresent: satisfied,
          valueFingerprint: fp,
          groupKey: null,
          domHint: el.id || el.getAttribute("name") || "",
        });
        continue;
      }

      if (type === "file") {
        const req = looksRequired(el, label) || (el.required ? "file_required" : null);
        if (!req && !el.required) continue;
        if (isHoneypot(el, label)) continue;
        if (!visibleLikeHuman(el) && !el.required && !/resume|cv/i.test(label)) continue;
        const count = (el.files && el.files.length) || 0;
        out.push({
          key: `${frameId}:file:${el.id || el.getAttribute("name") || label}`,
          kind: "file",
          label: label.slice(0, 80) || "Resume",
          requiredReason: req || "file_required",
          satisfied: count > 0,
          valuePresent: count > 0,
          valueFingerprint: count > 0 ? `files:${count}` : null,
          groupKey: null,
          domHint: el.id || el.getAttribute("name") || "file",
        });
        continue;
      }

      if (el.tagName === "SELECT" || type === "select-one" || type === "select-multiple") {
        const req = looksRequired(el, label);
        if (!req) continue;
        if (isHoneypot(el, label)) continue;
        if (!visibleLikeHuman(el) && !el.required) continue;
        const ok = isSatisfiedSelect(el);
        out.push({
          key: `${frameId}:select:${el.id || el.getAttribute("name") || label}`,
          kind: "select",
          label: label.slice(0, 80),
          requiredReason: req,
          satisfied: ok,
          valuePresent: ok,
          valueFingerprint: ok ? fingerprint(el.value) : null,
          groupKey: null,
          domHint: el.id || el.getAttribute("name") || "",
        });
        continue;
      }

      if (
        el.tagName === "TEXTAREA" ||
        ["text", "email", "tel", "url", "search", "number", "password", ""].includes(type) ||
        type === "textarea"
      ) {
        const req = looksRequired(el, label);
        if (!req) continue;
        if (isHoneypot(el, label)) continue;
        if (!visibleLikeHuman(el) && !el.required) continue;
        const ok = isSatisfiedText(el);
        let kind = "text";
        if (type === "email") kind = "email";
        else if (type === "tel") kind = "tel";
        else if (el.tagName === "TEXTAREA") kind = "textarea";
        out.push({
          key: `${frameId}:${kind}:${el.id || el.getAttribute("name") || label}`,
          kind,
          label: label.slice(0, 80),
          requiredReason: req,
          satisfied: ok,
          valuePresent: ok,
          valueFingerprint: ok ? fingerprint(el.value) : null,
          groupKey: null,
          domHint: el.id || el.getAttribute("name") || "",
        });
      }
    }
  }

  const fields = [];
  collectFromDoc(document, "main", fields);
  const iframes = document.querySelectorAll("iframe");
  for (let i = 0; i < iframes.length; i++) {
    try {
      const idoc = iframes[i].contentDocument;
      if (idoc) collectFromDoc(idoc, `iframe:${i}`, fields);
    } catch (e) {
      // cross-origin — skip
    }
  }

  const satisfied = fields.filter((f) => f.satisfied).length;
  return {
    scanTs: Date.now() / 1000,
    fields,
    summary: {
      totalRequired: fields.length,
      satisfied,
      unsatisfied: fields.length - satisfied,
    },
  };
})()
"""

_JS_CLASSIFY_POST_SUBMIT = r"""
(() => {
  const text = (document.body && (document.body.innerText || document.body.textContent) || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  const evidence = [];

  function pushEvidence(s) {
    if (!s) return;
    const clean = String(s).replace(/\s+/g, " ").trim().slice(0, 120);
    if (clean && evidence.length < 3) evidence.push(clean);
  }

  const spamRe = /(possible|potential)\s+spam|flagged as (possible )?spam|automated submission|protect against spam and bots/i;
  if (spamRe.test(text)) {
    const m = text.match(spamRe);
    pushEvidence(m ? m[0] : "spam banner");
    return { classification: "spam_blocked", confidence: "high", evidence, urlChanged: false };
  }

  const captchaVisible = !!(
    document.querySelector('iframe[src*="recaptcha"]') ||
    document.querySelector('iframe[src*="hcaptcha"]') ||
    document.querySelector(".g-recaptcha, [data-sitekey]")
  );
  if (captchaVisible || /verify you are human|complete the captcha|i.?m not a robot/i.test(text)) {
    pushEvidence("captcha challenge visible");
    return { classification: "captcha", confidence: "high", evidence, urlChanged: false };
  }

  if (/code was sent|verification code|security code|enter the code|one-time (pass)?code/i.test(text)) {
    pushEvidence("verification code gate");
    return { classification: "verification_gate", confidence: "high", evidence, urlChanged: false };
  }

  const alerts = Array.from(document.querySelectorAll('[role="alert"], .error, .field-error, [aria-invalid="true"]'))
    .filter((el) => {
      const cs = window.getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    })
    .map((el) => (el.innerText || el.textContent || "").trim())
    .filter(Boolean);
  if (alerts.length && /required|invalid|must |please (enter|select|provide)|upload failed/i.test(alerts.join(" "))) {
    pushEvidence(alerts[0]);
    return { classification: "validation_errors", confidence: "medium", evidence, urlChanged: false };
  }

  if (
    /thank you for applying|application (has been )?received|successfully submitted|we('ve| have) received your application|application submitted/i.test(text)
  ) {
    const m = text.match(
      /thank you for applying|application (has been )?received|successfully submitted|we('ve| have) received your application|application submitted/i
    );
    pushEvidence(m ? m[0] : "confirmation");
    return { classification: "confirmed", confidence: "high", evidence, urlChanged: true };
  }

  const submitBtn = Array.from(
    document.querySelectorAll('button, input[type="submit"], [role="button"]')
  ).find((el) => /submit|apply/i.test((el.innerText || el.value || el.getAttribute("aria-label") || "")));
  const stillForm = !!(
    document.querySelector('input[type="file"], input[type="email"], form') && submitBtn
  );
  if (stillForm) {
    pushEvidence("submit control still present");
    return { classification: "still_on_form", confidence: "medium", evidence, urlChanged: false };
  }

  pushEvidence(text.slice(0, 80));
  return { classification: "unconfirmed", confidence: "low", evidence, urlChanged: false };
})()
"""

# Fingerprint probe — no PII, safe to log.
_JS_FINGERPRINT_PROBE = r"""
(() => ({
  userAgent: navigator.userAgent || null,
  platform: navigator.platform || null,
  webdriver: navigator.webdriver === true,
  languages: Array.from(navigator.languages || []).slice(0, 5),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
  offsetMin: new Date().getTimezoneOffset(),
  hardwareConcurrency: navigator.hardwareConcurrency || null,
  maxTouchPoints: navigator.maxTouchPoints || 0,
  language: navigator.language || null,
}))()
"""


def evaluate_required_inventory(
    report: dict | None,
    upload_state: dict | None = None,
) -> list[dict]:
    """Return unsatisfied required entries. Merges accepted uploads into file fields."""
    if not isinstance(report, dict):
        return []
    fields = report.get("fields") or []
    if not isinstance(fields, list):
        return []

    upload_fields: dict = {}
    if isinstance(upload_state, dict):
        maybe = upload_state.get("fields") or {}
        if isinstance(maybe, dict):
            upload_fields = maybe

    unsatisfied: list[dict] = []
    for entry in fields:
        if not isinstance(entry, dict):
            continue
        item = dict(entry)
        kind = item.get("kind")
        if kind == "file" and not item.get("satisfied"):
            label = (item.get("label") or "").lower()
            for key, meta in upload_fields.items():
                if not isinstance(meta, dict):
                    continue
                if meta.get("status") != "accepted":
                    continue
                # Any accepted upload can satisfy a required file field on
                # single-upload forms (typical Ashby/Greenhouse resume slot).
                item["satisfied"] = True
                item["valuePresent"] = True
                _ = (key, label)  # retain for future multi-upload matching
                break
        if item.get("kind") == "combobox":
            fp = (item.get("valueFingerprint") or "").strip().lower()
            if fp in _PLACEHOLDER_TOKENS:
                item["satisfied"] = False
                item["valuePresent"] = False
        if not item.get("satisfied"):
            unsatisfied.append(item)
    return unsatisfied


def hash_inventory(report: dict | None) -> str:
    """Stable fingerprint of the required-field inventory for fixed-point checks."""
    if not isinstance(report, dict):
        return "empty"
    rows = []
    for entry in report.get("fields") or []:
        if not isinstance(entry, dict):
            continue
        rows.append(
            (
                str(entry.get("key") or ""),
                bool(entry.get("satisfied")),
                str(entry.get("valueFingerprint") or ""),
            )
        )
    rows.sort()
    blob = json.dumps(rows, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def required_field_blocker_message(unsatisfied: list[dict]) -> str:
    labels = []
    for entry in unsatisfied[:6]:
        label = (entry.get("label") or entry.get("domHint") or "a required field").strip()
        label = re.sub(r"\s+", " ", label)[:80]
        if label and label not in labels:
            labels.append(label)
    joined = ", ".join(f'"{lab}"' for lab in labels) or "required fields"
    count = len(unsatisfied)
    return (
        f"BLOCKED — {count} required field{'s' if count != 1 else ''} "
        f"{'are' if count != 1 else 'is'} still empty: {joined}. "
        "Fill them, then call pre_submit_check again. Do NOT click Submit."
    )


def inventory_telemetry_summary(report: dict | None, unsatisfied: list[dict]) -> dict:
    kinds: dict[str, int] = {}
    for entry in (report or {}).get("fields") or []:
        if isinstance(entry, dict):
            kind = str(entry.get("kind") or "unknown")
            kinds[kind] = kinds.get(kind, 0) + 1
    labels = [
        re.sub(r"\s+", " ", str(e.get("label") or "")).strip()[:80]
        for e in unsatisfied[:8]
        if isinstance(e, dict)
    ]
    summary = (report or {}).get("summary") if isinstance(report, dict) else {}
    return {
        "totalRequired": (summary or {}).get(
            "totalRequired", len((report or {}).get("fields") or [])
        ),
        "unsatisfied": len(unsatisfied),
        "kinds": kinds,
        "labels_redacted": labels,
    }


def classify_post_submit_payload(payload: dict | None) -> dict[str, Any]:
    """Normalize a JS verdict into the stable PostSubmitVerdict shape."""
    if not isinstance(payload, dict):
        return {
            "classification": "unconfirmed",
            "confidence": "low",
            "evidence": [],
            "urlChanged": False,
        }
    classification = payload.get("classification") or "unconfirmed"
    allowed = {
        "confirmed",
        "spam_blocked",
        "validation_errors",
        "verification_gate",
        "captcha",
        "still_on_form",
        "unconfirmed",
    }
    if classification not in allowed:
        classification = "unconfirmed"
    evidence = []
    for item in payload.get("evidence") or []:
        text = re.sub(r"\s+", " ", str(item)).strip()[:120]
        if text:
            evidence.append(text)
        if len(evidence) >= 3:
            break
    confidence = payload.get("confidence") or "low"
    if confidence not in {"high", "medium", "low"}:
        confidence = "low"
    return {
        "classification": classification,
        "confidence": confidence,
        "evidence": evidence,
        "urlChanged": bool(payload.get("urlChanged")),
    }


# Strict spam phrases — bare "spam" alone is not enough (false positives like
# "designed to prevent spam filters" in cover letters / notes).
_SPAM_DONE_PHRASES = (
    "possible spam",
    "potential spam",
    "flagged as spam",
    "flagged as possible spam",
    "spam_blocked",
    "spam block",
    "rejected as spam",
)

_CONFIRM_DONE_PHRASES = (
    "application received",
    "thank you for applying",
    "successfully submitted",
    "we have received",
    "we've received",
    "application submitted",
)


def final_text_looks_like_spam(final: str) -> bool:
    lower = (final or "").lower()
    return any(p in lower for p in _SPAM_DONE_PHRASES)


def final_text_looks_confirmed(final: str) -> bool:
    lower = (final or "").lower()
    return any(p in lower for p in _CONFIRM_DONE_PHRASES)


def timezone_geo_mismatch(
    *,
    geo_state: str | None,
    timezone_id: str | None,
) -> str | None:
    """
    Warn when the Browserbase-locked timezone disagrees with applicant geo.

    Indiana (and several Eastern states) have been observed locked to
    America/Chicago on Browserbase Developer sessions — unfixable without
    Enterprise / vendor support.
    """
    state = (geo_state or "").strip().upper()
    tz = (timezone_id or "").strip()
    if not state or not tz:
        return None
    eastern_states = {
        "IN", "OH", "MI", "PA", "NY", "NJ", "VA", "NC", "SC", "GA", "FL",
        "MA", "CT", "VT", "NH", "ME", "RI", "MD", "DE", "WV", "DC",
    }
    if state in eastern_states and tz in {"America/Chicago", "America/Mexico_City"}:
        return (
            f"timezone_geo_mismatch: geo_state={state} but browser timezone={tz} "
            "(Browserbase Developer plan locks tz; cannot override via CDP)"
        )
    return None


__all__ = [
    "PostSubmitClassification",
    "_JS_SCAN_REQUIRED_FIELDS",
    "_JS_CLASSIFY_POST_SUBMIT",
    "_JS_FINGERPRINT_PROBE",
    "evaluate_required_inventory",
    "hash_inventory",
    "required_field_blocker_message",
    "inventory_telemetry_summary",
    "classify_post_submit_payload",
    "final_text_looks_like_spam",
    "final_text_looks_confirmed",
    "timezone_geo_mismatch",
]
