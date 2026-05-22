import logging
import os
import tempfile
from dotenv import load_dotenv
from browserbase import Browserbase
from playwright.async_api import async_playwright

from core.ai_router import call_ai

load_dotenv()

logger = logging.getLogger(__name__)

BROWSERBASE_API_KEY = os.getenv("BROWSERBASE_API_KEY")
BROWSERBASE_PROJECT_ID = os.getenv("BROWSERBASE_PROJECT_ID")


class NeedsAttentionException(Exception):
    def __init__(self, question: str):
        self.question = question
        super().__init__(f"Needs user attention: {question}")


async def _fill_if_exists(page, selector: str, value: str, field_name: str = "") -> bool:
    """
    Try to fill a single selector. Returns True if the element was found and filled.
    Logs at DEBUG if the element doesn't exist, WARNING on unexpected errors.
    """
    try:
        element = await page.query_selector(selector)
        if element:
            await element.fill(value)
            logger.info(f"Filled {field_name or selector}")
            return True
        else:
            logger.debug(f"Field not found: {field_name or selector} ({selector})")
            return False
    except Exception as e:
        logger.warning(f"Failed to fill {field_name or selector} ({selector}): {e}")
        return False


async def _fill_first_match(
    page,
    selectors: list[str],
    value: str,
    field_name: str,
) -> bool:
    """
    Try each selector in order; stop and return True on the first successful fill.
    Logs a warning if all selectors fail.
    """
    if not value:
        logger.debug(f"Skipping {field_name}: no value provided")
        return False
    for selector in selectors:
        result = await _fill_if_exists(page, selector, value, field_name)
        if result:
            return True
    logger.warning(f"All selectors failed for: {field_name}")
    return False


async def _select_if_exists(page, selector: str, value: str) -> None:
    try:
        el = await page.query_selector(selector)
        if el and value:
            await page.select_option(selector, label=value)
            logger.info(f"Selected '{value}' for {selector}")
    except Exception as e:
        logger.warning(f"Could not select {selector}: {e}")


async def generate_open_ended_answer(question: str, user_data: dict, company: str) -> str:
    relevant = {
        k: user_data.get(k)
        for k in ("name", "skills", "education", "experience", "projects", "summary")
        if user_data.get(k)
    }
    prompt = f"Company: {company}\nQuestion: {question}\nStudent background: {relevant}"
    system = (
        "You are helping a student apply for an internship. "
        "Write a genuine, specific answer to this application question based on their background."
    )
    answer = await call_ai(
        task="quality",
        messages=[{"role": "user", "content": prompt}],
        system=system,
        max_tokens=400,
    )
    words = answer.split()
    if len(words) > 300:
        answer = " ".join(words[:300])
    return answer


_WORK_AUTH_MAP = {
    "us_citizen": "Yes",
    "green_card": "Yes",
    "f1_student": "Requires Sponsorship",
    "h1b": "Requires Sponsorship",
    "other_visa": "Requires Sponsorship",
}

# ---------------------------------------------------------------------------
# Selector lists for common Greenhouse fields
# ---------------------------------------------------------------------------

_FIRST_NAME_SELECTORS = [
    "#first_name",
    "#job_application_first_name",
    "input[name='job_application[first_name]']",
    "input[autocomplete='given-name']",
    "input[placeholder*='first' i]",
]

_LAST_NAME_SELECTORS = [
    "#last_name",
    "#job_application_last_name",
    "input[name='job_application[last_name]']",
    "input[autocomplete='family-name']",
    "input[placeholder*='last' i]",
]

_EMAIL_SELECTORS = [
    "#email",
    "#job_application_email",
    "input[name='job_application[email]']",
    "input[type='email']",
    "input[autocomplete='email']",
]

_PHONE_SELECTORS = [
    "#phone",
    "#job_application_phone",
    "input[name='job_application[phone]']",
    "input[type='tel']",
    "input[placeholder*='phone' i]",
]

_LOCATION_SELECTORS = [
    "#job_application_location",
    "input[name='job_application[location]']",
    "input[placeholder*='location' i]",
    "input[placeholder*='city' i]",
]

_LINKEDIN_SELECTORS = [
    "input[id*='linkedin' i]",
    "input[name*='linkedin' i]",
    "input[placeholder*='linkedin' i]",
]

_GITHUB_SELECTORS = [
    "input[id*='github' i]",
    "input[name*='github' i]",
    "input[placeholder*='github' i]",
]

_PORTFOLIO_SELECTORS = [
    "input[id*='website' i]",
    "input[id*='portfolio' i]",
    "input[name*='website' i]",
    "input[placeholder*='website' i]",
    "input[placeholder*='portfolio' i]",
]

_CONFIRMATION_SELECTORS = [
    "text=Thank you for applying",
    "text=Application submitted",
    "text=application has been received",
    "text=We'll be in touch",
    ".confirmation",
    "#confirmation",
]


class GreenhouseMCP:
    async def apply(self, job_url: str, user_data: dict, resume_pdf: bytes) -> dict:
        bb = Browserbase(api_key=BROWSERBASE_API_KEY)
        session = bb.sessions.create(project_id=BROWSERBASE_PROJECT_ID)
        tmp_path = None
        page = None

        try:
            async with async_playwright() as p:
                browser = await p.chromium.connect_over_cdp(session.connect_url)
                page = await browser.new_page()
                logger.info(f"Playwright connected to session: {session.id}")

                # Navigate to the job URL
                await page.goto(job_url, wait_until="networkidle")
                logger.info(f"Navigated to {job_url}")

                # ---- CAPTCHA detection (before filling any fields) ----
                captcha_present = await page.query_selector(
                    "iframe[src*='hcaptcha'], "
                    "iframe[src*='recaptcha'], "
                    ".g-recaptcha, "
                    "[data-sitekey]"
                )
                if captcha_present:
                    logger.warning("CAPTCHA detected on page — cannot proceed automatically")
                    return {
                        "success": False,
                        "portal": "greenhouse",
                        "session_id": session.id,
                        "error": "CAPTCHA detected",
                        "needs_attention": True,
                        "attention_question": "CAPTCHA verification required",
                    }

                # ---- Fill basic fields ----
                await _fill_first_match(page, _FIRST_NAME_SELECTORS, user_data.get("first_name", ""), "first_name")
                await page.wait_for_timeout(6000)
                await _fill_first_match(page, _LAST_NAME_SELECTORS, user_data.get("last_name", ""), "last_name")
                await page.wait_for_timeout(6000)
                await _fill_first_match(page, _EMAIL_SELECTORS, user_data.get("email", ""), "email")
                await page.wait_for_timeout(6000)
                await _fill_first_match(page, _PHONE_SELECTORS, user_data.get("phone", ""), "phone")
                await page.wait_for_timeout(6000)
                await _fill_first_match(page, _LOCATION_SELECTORS, user_data.get("location", ""), "location")
                await page.wait_for_timeout(6000)
                await _fill_first_match(page, _LINKEDIN_SELECTORS, user_data.get("linkedin_url", ""), "linkedin")
                await page.wait_for_timeout(6000)
                await _fill_first_match(page, _GITHUB_SELECTORS, user_data.get("github_url", ""), "github")
                await page.wait_for_timeout(6000)
                await _fill_first_match(page, _PORTFOLIO_SELECTORS, user_data.get("portfolio_url", ""), "portfolio")
                await page.wait_for_timeout(6000)

                # ---- Upload resume ----
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(resume_pdf)
                    tmp_path = tmp.name

                for resume_sel in (
                    'input[type="file"][id*="resume" i]',
                    'input[type="file"][name*="resume" i]',
                ):
                    try:
                        el = await page.query_selector(resume_sel)
                        if el:
                            await page.set_input_files(resume_sel, tmp_path)
                            logger.info(f"Resume uploaded via {resume_sel}")
                            await page.wait_for_timeout(6000)
                            break
                    except Exception as e:
                        logger.warning(f"Resume upload failed for {resume_sel}: {e}")

                os.unlink(tmp_path)
                tmp_path = None

                # ---- Work authorization and sponsorship ----
                work_auth = user_data.get("work_authorization", "")
                auth_value = _WORK_AUTH_MAP.get(work_auth, "")
                if auth_value:
                    for sel in ('select[id*="work_status" i]', 'select[id*="authorized" i]'):
                        await _select_if_exists(page, sel, auth_value)
                await page.wait_for_timeout(6000)

                requires_sponsorship = user_data.get("requires_sponsorship")
                if requires_sponsorship is not None:
                    sponsor_value = "Yes" if requires_sponsorship else "No"
                    await _select_if_exists(page, 'select[id*="sponsor" i]', sponsor_value)
                await page.wait_for_timeout(6000)

                # ---- Education fields ----
                await _fill_if_exists(page, 'input[id*="school" i]', user_data.get("school", ""), "school")
                await page.wait_for_timeout(6000)
                await _select_if_exists(page, 'select[id*="degree" i]', user_data.get("degree", ""))
                await page.wait_for_timeout(6000)
                gpa = user_data.get("gpa")
                await _fill_if_exists(page, 'input[id*="gpa" i]', str(gpa) if gpa else "", "gpa")
                await page.wait_for_timeout(6000)

                # ---- Custom / open-ended questions ----
                company = user_data.get("company") or job_url.split("/")[2]
                answers_library: dict = user_data.get("answers_library", {})
                open_ended_preference: str = user_data.get("open_ended_preference", "library")
                textareas = await page.query_selector_all("textarea")

                for textarea in textareas:
                    try:
                        label_text = ""
                        textarea_id = await textarea.get_attribute("id")
                        if textarea_id:
                            label_el = await page.query_selector(f'label[for="{textarea_id}"]')
                            if label_el:
                                label_text = (await label_el.inner_text()).strip()
                        if not label_text:
                            label_text = (await textarea.get_attribute("placeholder") or "").strip()
                        if not label_text:
                            label_text = (await textarea.get_attribute("name") or "").strip()

                        answer = None
                        for key, val in answers_library.items():
                            if key.lower() in label_text.lower() or label_text.lower() in key.lower():
                                answer = val.replace("{company}", company)
                                break

                        if answer is None:
                            if open_ended_preference == "auto":
                                answer = await generate_open_ended_answer(label_text, user_data, company)
                            elif open_ended_preference in ("sms", "email"):
                                raise NeedsAttentionException(label_text)

                        if answer:
                            await textarea.fill(answer)
                            logger.info(f"Filled textarea '{label_text}'")
                            await page.wait_for_timeout(6000)
                    except NeedsAttentionException:
                        raise
                    except Exception as e:
                        logger.warning(f"Could not fill textarea: {e}")

                # ---- Submit ----
                for submit_sel in (
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'button:has-text("Submit Application")',
                ):
                    try:
                        el = await page.query_selector(submit_sel)
                        if el:
                            await el.click()
                            logger.info(f"Clicked submit via {submit_sel}")
                            break
                    except Exception as e:
                        logger.warning(f"Submit click failed for {submit_sel}: {e}")

                await page.wait_for_timeout(10000)

                # ---- Strict confirmation check ----

                # Check 1: any required fields still showing validation errors?
                error_fields = await page.query_selector_all(
                    "input.invalid, "
                    "input[aria-invalid='true'], "
                    ".field_with_errors input, "
                    "input:required:invalid"
                )
                if error_fields:
                    logger.warning(f"Form has {len(error_fields)} invalid field(s) — submission failed")
                    return {
                        "success": False,
                        "session_id": session.id,
                        "portal": "greenhouse",
                        "error": f"Form validation failed: {len(error_fields)} required field(s) missing",
                        "needs_attention": False,
                        "attention_question": None,
                    }

                # Check 2: is the application form still present?
                form_still_present = await page.query_selector(
                    "#application_form, form#application, .application-form"
                )

                # Check 3: explicit confirmation indicators
                confirmed = False
                for selector in _CONFIRMATION_SELECTORS:
                    try:
                        element = await page.query_selector(selector)
                        if element:
                            confirmed = True
                            logger.info(f"Confirmation detected via: {selector}")
                            break
                    except Exception:
                        continue

                if confirmed or (not form_still_present and not error_fields):
                    return {
                        "success": True,
                        "session_id": session.id,
                        "portal": "greenhouse",
                        "error": None,
                        "needs_attention": False,
                        "attention_question": None,
                    }

                return {
                    "success": False,
                    "session_id": session.id,
                    "portal": "greenhouse",
                    "error": "Could not confirm submission",
                    "needs_attention": False,
                    "attention_question": None,
                }

        except NeedsAttentionException as e:
            return {
                "success": False,
                "session_id": session.id,
                "portal": "greenhouse",
                "error": "Needs attention",
                "needs_attention": True,
                "attention_question": e.question,
            }
        except Exception as e:
            logger.error(f"apply() failed for {job_url}: {e}")
            if page:
                try:
                    await page.screenshot(path=f"error_{session.id}.png")
                except Exception:
                    pass
            raise
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
            try:
                bb.sessions.update(session.id, status="REQUEST_RELEASE")
            except Exception:
                pass
