"""OTP extraction grammar for the AgentMail shared inbox (core/agentmail_inbox.py).

Pinned against Greenhouse's LIVE template (July 2026), which broke the original
grammar three ways at once:
1. The code follows a colon ~50 chars after the word "code" ("…the security code
   field on your application: TCabcdWw") — out of reach of a tight adjacency anchor.
2. The code can be LETTERS-ONLY mixed case (no digits), so a digits-required
   fallback misses it entirely.
3. The English word "resubmit" (8 letters) sits directly after "the code," — the
   exact spot a naive adjacency anchor matches first.
Extraction must return the real code, never the word.
"""
import os

os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

import core.agentmail_inbox as am  # noqa: E402

# The real template shape, code swapped for a same-shape stand-in (letters-only,
# mixed case beyond a leading capital — matches what Greenhouse actually sends).
GREENHOUSE_BODY = (
    "Hi Rabuor, Copy and paste this code into the security code field on your "
    "application: TCabcdWw After you enter the code, resubmit your application. "
    "2026 Greenhouse 18 West 18th Street, 11th Floor, New York, NY 10011, USA"
)
GREENHOUSE_SUBJECT = "Security code for your application to Ginkgo Bioworks Inc."


def test_live_template_extracts_real_code_not_resubmit():
    assert am.extract_code(GREENHOUSE_SUBJECT, GREENHOUSE_BODY) == "TCabcdWw"


def test_live_template_is_otp_shaped():
    assert am._otp_shaped_code(GREENHOUSE_SUBJECT, GREENHOUSE_BODY) == "TCabcdWw"


def test_html_only_body():
    # Greenhouse ships the code only in the HTML part; the plain-text part is empty.
    html_body = (
        "<html><body><p>Copy and paste this code into the security code field "
        "on your application:</p><h1>TCabcdWw</h1>"
        "<p>After you enter the code, resubmit your application.</p></body></html>"
    )
    assert am.extract_code("", html_body) == "TCabcdWw"


def test_adjacent_digitful_code_still_works():
    assert am.extract_code("", "Your verification code AB12CD34 expires soon") == "AB12CD34"


def test_colon_reach_with_digits():
    assert am.extract_code("", "Enter the security code shown below: 9XK2PQ7M") == "9XK2PQ7M"


def test_prose_words_never_match():
    # No code present: every 8-letter word here is prose-shaped and must be rejected.
    text = (
        "Thanks for your application. After you enter the code, resubmit your "
        "application and continue. Find us on LinkedIn for updates."
    )
    assert am.extract_code("Security code reminder", text) is None


def test_titlecase_and_allcaps_rejected_at_anchor():
    assert am.extract_code("", "Use this code: Security") is None
    assert am.extract_code("", "Use this code: SECURITY") is None


def test_loose_fallback_requires_digits():
    # Letters-only tokens are only trusted at an anchored position; in free text
    # ("LinkedIn") they are word-shaped and must not match.
    assert am.extract_code("", "Visit our LinkedIn page") is None
    assert am.extract_code("Verify your application", "ref 7GH4KL2P attached") == "7GH4KL2P"
