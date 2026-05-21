import logging
import os
import tempfile
from dotenv import load_dotenv
from browserbase import Browserbase
from playwright.async_api import async_playwright

from services.mcp.greenhouse import NeedsAttentionException, generate_open_ended_answer

load_dotenv()

logger = logging.getLogger(__name__)

BROWSERBASE_API_KEY = os.getenv("BROWSERBASE_API_KEY")
BROWSERBASE_PROJECT_ID = os.getenv("BROWSERBASE_PROJECT_ID")

_ELIGIBLE_WORK_AUTH = {"us_citizen", "green_card"}


async def _fill_if_exists(page, selector: str, value: str) -> None:
    try:
        el = await page.query_selector(selector)
        if el and value:
            await el.fill(value)
            logger.info(f"Filled {selector}")
    except Exception as e:
        logger.warning(f"Could not fill {selector}: {e}")


async def _select_if_exists(page, selector: str, value: str) -> None:
    try:
        el = await page.query_selector(selector)
        if el and value:
            await page.select_option(selector, label=value)
            logger.info(f"Selected '{value}' for {selector}")
    except Exception as e:
        logger.warning(f"Could not select {selector}: {e}")


async def _click_radio(page, selector: str) -> None:
    try:
        el = await page.query_selector(selector)
        if el:
            await el.click()
            logger.info(f"Clicked radio {selector}")
    except Exception as e:
        logger.warning(f"Could not click radio {selector}: {e}")


async def _click_next(page) -> None:
    for sel in (
        'button:has-text("Next")',
        'button:has-text("Continue")',
        'input[value="Next"]',
        'input[value="Continue"]',
        'a:has-text("Next")',
    ):
        try:
            el = await page.query_selector(sel)
            if el:
                await el.click()
                logger.info(f"Clicked next/continue via {sel}")
                await page.wait_for_timeout(2000)
                return
        except Exception as e:
            logger.warning(f"Could not click next {sel}: {e}")


class USAJobsMCP:
    async def apply(self, job_url: str, user_data: dict, resume_pdf: bytes) -> dict:
        # Pre-check: USAJobs requires US citizenship or permanent residency
        work_auth = user_data.get("work_authorization")
        if work_auth not in _ELIGIBLE_WORK_AUTH:
            return {
                "success": False,
                "portal": "usajobs",
                "error": "USAJobs requires US citizenship or permanent residency",
                "needs_attention": False,
                "attention_question": None,
            }

        # Pre-check: USAJobs account credentials required
        usajobs_email = user_data.get("usajobs_email")
        usajobs_password = user_data.get("usajobs_password")
        if not usajobs_email or not usajobs_password:
            return {
                "success": False,
                "portal": "usajobs",
                "error": "Needs attention",
                "needs_attention": True,
                "attention_question": "USAJobs account credentials required",
            }

        bb = Browserbase(api_key=BROWSERBASE_API_KEY)
        session = bb.sessions.create(project_id=BROWSERBASE_PROJECT_ID)
        tmp_path = None
        page = None

        try:
            async with async_playwright() as p:
                browser = await p.chromium.connect_over_cdp(session.connect_url)
                page = await browser.new_page()
                logger.info(f"Playwright connected to session: {session.id}")

                # 1. Navigate to the job URL
                await page.goto(job_url, wait_until="networkidle")
                logger.info(f"Navigated to {job_url}")

                # 2. Click "Apply" button
                for apply_sel in (
                    'a:has-text("Apply")',
                    'button:has-text("Apply")',
                    'a[id*="apply" i]',
                    'button[id*="apply" i]',
                ):
                    try:
                        el = await page.query_selector(apply_sel)
                        if el:
                            await el.click()
                            logger.info(f"Clicked Apply via {apply_sel}")
                            await page.wait_for_timeout(3000)
                            break
                    except Exception as e:
                        logger.warning(f"Could not click Apply {apply_sel}: {e}")

                # 3. Login if redirected to login page
                login_email_el = await page.query_selector('#email, input[name="email"]')
                if login_email_el:
                    logger.info("Login form detected — filling credentials")
                    await _fill_if_exists(page, '#email, input[name="email"]', usajobs_email)
                    await page.wait_for_timeout(500)
                    await _fill_if_exists(page, '#password, input[name="password"]', usajobs_password)
                    await page.wait_for_timeout(500)
                    for submit_sel in ('button[type="submit"]', 'input[type="submit"]'):
                        try:
                            el = await page.query_selector(submit_sel)
                            if el:
                                await el.click()
                                logger.info(f"Submitted login via {submit_sel}")
                                await page.wait_for_timeout(4000)
                                break
                        except Exception as e:
                            logger.warning(f"Login submit failed {submit_sel}: {e}")

                # 4. Fill multi-step application wizard
                company = user_data.get("company") or job_url.split("/")[2]
                answers_library: dict = user_data.get("answers_library", {})
                open_ended_preference: str = user_data.get("open_ended_preference", "library")

                # Upload resume if file input present
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(resume_pdf)
                    tmp_path = tmp.name

                for resume_sel in (
                    'input[type="file"][id*="resume" i]',
                    'input[type="file"][name*="resume" i]',
                    'input[type="file"]',
                ):
                    try:
                        el = await page.query_selector(resume_sel)
                        if el:
                            await page.set_input_files(resume_sel, tmp_path)
                            logger.info(f"Resume uploaded via {resume_sel}")
                            await page.wait_for_timeout(1000)
                            break
                    except Exception as e:
                        logger.warning(f"Resume upload failed for {resume_sel}: {e}")

                os.unlink(tmp_path)
                tmp_path = None

                # Citizenship field
                await _select_if_exists(page, 'select[name*="citizen" i]', "Yes")
                await page.wait_for_timeout(500)

                # Availability
                availability = user_data.get("availability", "")
                if availability:
                    await _select_if_exists(page, 'select[name*="available" i]', availability)
                    await page.wait_for_timeout(500)

                # Federal experience (default: No)
                federal_exp = user_data.get("federal_experience", False)
                federal_val = "Yes" if federal_exp else "No"
                await _click_radio(
                    page,
                    f'input[type="radio"][name*="federal" i][value*="{federal_val}" i]',
                )
                await page.wait_for_timeout(500)

                # Veterans preference (default: No preference)
                veterans_pref = user_data.get("veterans_preference", "No preference")
                await _click_radio(
                    page,
                    f'input[type="radio"][name*="veteran" i][value*="{veterans_pref}" i]',
                )
                await page.wait_for_timeout(500)

                # 5. Walk through wizard steps — up to 10 steps
                for _ in range(10):
                    # Fill any open-ended textareas on current step
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
                                await page.wait_for_timeout(500)
                        except NeedsAttentionException:
                            raise
                        except Exception as e:
                            logger.warning(f"Could not fill textarea: {e}")

                    # Check if we're on confirmation / final step
                    current_url = page.url.lower()
                    page_text = (await page.inner_text("body")).lower()
                    if any(kw in current_url for kw in ("confirmation", "thank", "success", "submitted")):
                        break
                    if any(
                        phrase in page_text
                        for phrase in ("application has been submitted", "thank you for applying", "successfully submitted")
                    ):
                        break

                    # Try submit first, then next/continue
                    submitted = False
                    for submit_sel in (
                        'button[type="submit"]',
                        'input[type="submit"]',
                        'button:has-text("Submit")',
                    ):
                        try:
                            el = await page.query_selector(submit_sel)
                            if el:
                                await el.click()
                                logger.info(f"Clicked submit via {submit_sel}")
                                await page.wait_for_timeout(3000)
                                submitted = True
                                break
                        except Exception as e:
                            logger.warning(f"Submit click failed {submit_sel}: {e}")

                    if not submitted:
                        await _click_next(page)

                await page.wait_for_timeout(5000)

                current_url = page.url.lower()
                page_text = (await page.inner_text("body")).lower()
                success = (
                    any(kw in current_url for kw in ("confirmation", "thank", "success", "submitted"))
                    or any(
                        phrase in page_text
                        for phrase in ("application has been submitted", "thank you for applying", "successfully submitted")
                    )
                )

                if success:
                    return {
                        "success": True,
                        "session_id": session.id,
                        "portal": "usajobs",
                        "error": None,
                        "needs_attention": False,
                        "attention_question": None,
                    }
                return {
                    "success": False,
                    "session_id": session.id,
                    "portal": "usajobs",
                    "error": "No confirmation detected",
                    "needs_attention": False,
                    "attention_question": None,
                }

        except NeedsAttentionException as e:
            return {
                "success": False,
                "session_id": session.id,
                "portal": "usajobs",
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
