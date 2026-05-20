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

_WORK_AUTH_MAP = {
    "us_citizen": "Yes",
    "green_card": "Yes",
    "f1_student": "Requires Sponsorship",
    "h1b": "Requires Sponsorship",
    "other_visa": "Requires Sponsorship",
}


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


async def _fill_first_match(page, selectors: list, value: str) -> None:
    for sel in selectors:
        try:
            el = await page.query_selector(sel)
            if el and value:
                await el.fill(value)
                logger.info(f"Filled {sel}")
                return
        except Exception as e:
            logger.warning(f"Could not fill {sel}: {e}")


class AshbyMCP:
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

                # 3. Navigate and wait for React form to fully render
                await page.goto(job_url, wait_until="networkidle")
                await page.wait_for_timeout(2000)
                await page.wait_for_load_state("networkidle")
                logger.info(f"Navigated to {job_url}")

                # 4. Fill basic fields
                await _fill_first_match(page, [
                    'input[name="firstName"]',
                    'input[placeholder*="first" i]',
                ], user_data.get("first_name", ""))
                await page.wait_for_timeout(500)

                await _fill_first_match(page, [
                    'input[name="lastName"]',
                    'input[placeholder*="last" i]',
                ], user_data.get("last_name", ""))
                await page.wait_for_timeout(500)

                await _fill_first_match(page, [
                    'input[name="email"]',
                    'input[type="email"]',
                ], user_data.get("email", ""))
                await page.wait_for_timeout(500)

                await _fill_first_match(page, [
                    'input[name="phone"]',
                    'input[type="tel"]',
                ], user_data.get("phone", ""))
                await page.wait_for_timeout(500)

                await _fill_first_match(page, [
                    'input[name="location"]',
                    'input[placeholder*="location" i]',
                    'input[placeholder*="city" i]',
                ], user_data.get("location", ""))
                await page.wait_for_timeout(500)

                await _fill_first_match(page, [
                    'input[placeholder*="linkedin" i]',
                    'input[name*="linkedin" i]',
                ], user_data.get("linkedin_url", ""))
                await page.wait_for_timeout(500)

                await _fill_first_match(page, [
                    'input[placeholder*="github" i]',
                    'input[name*="github" i]',
                ], user_data.get("github_url", ""))
                await page.wait_for_timeout(500)

                await _fill_first_match(page, [
                    'input[placeholder*="website" i]',
                    'input[placeholder*="portfolio" i]',
                ], user_data.get("portfolio_url", ""))
                await page.wait_for_timeout(500)

                # 5. Upload resume
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(resume_pdf)
                    tmp_path = tmp.name

                try:
                    el = await page.query_selector('input[type="file"]')
                    if el:
                        await page.set_input_files('input[type="file"]', tmp_path)
                        logger.info("Resume uploaded via input[type='file']")
                        await page.wait_for_timeout(500)
                    else:
                        # Some Ashby forms hide the file input behind an Upload button
                        btn = await page.query_selector('button:has-text("Upload")')
                        if btn:
                            await btn.click()
                            await page.wait_for_timeout(1000)
                            el = await page.query_selector('input[type="file"]')
                            if el:
                                await page.set_input_files('input[type="file"]', tmp_path)
                                logger.info("Resume uploaded after clicking Upload button")
                                await page.wait_for_timeout(500)
                except Exception as e:
                    logger.warning(f"Resume upload failed: {e}")

                os.unlink(tmp_path)
                tmp_path = None

                # 6. Work authorization
                work_auth = user_data.get("work_authorization", "")
                auth_value = _WORK_AUTH_MAP.get(work_auth, "")
                if auth_value:
                    for sel in ('[data-testid*="work" i]',):
                        await _select_if_exists(page, sel, auth_value)
                    # label:has-text("authorized") + select
                    try:
                        sel = await page.query_selector('select')
                        labels = await page.query_selector_all('label')
                        for label in labels:
                            label_text = (await label.inner_text()).lower()
                            if "authorized" in label_text or "work" in label_text:
                                label_for = await label.get_attribute("for")
                                if label_for:
                                    await _select_if_exists(page, f'#{label_for}', auth_value)
                                break
                    except Exception as e:
                        logger.warning(f"Could not fill work auth via label: {e}")
                await page.wait_for_timeout(500)

                # 7. Custom questions
                company = user_data.get("company") or job_url.split("/")[2]
                answers_library: dict = user_data.get("answers_library", {})
                open_ended_preference: str = user_data.get("open_ended_preference", "library")

                question_containers = await page.query_selector_all(
                    'div[data-testid="application-question"], div.ashby-application-form-question'
                )

                for container in question_containers:
                    try:
                        label_el = await container.query_selector("label")
                        question_text = (await label_el.inner_text()).strip() if label_el else ""

                        input_field = await container.query_selector("input, textarea, select")
                        if not input_field:
                            continue

                        tag_name = await input_field.evaluate("el => el.tagName.toLowerCase()")

                        answer = None
                        for key, val in answers_library.items():
                            if key.lower() in question_text.lower() or question_text.lower() in key.lower():
                                answer = val.replace("{company}", company)
                                break

                        if answer is None:
                            if open_ended_preference == "auto":
                                answer = await generate_open_ended_answer(question_text, user_data, company)
                            elif open_ended_preference in ("sms", "email"):
                                raise NeedsAttentionException(question_text)

                        if answer:
                            if tag_name in ("input", "textarea"):
                                await input_field.fill(answer)
                            elif tag_name == "select":
                                try:
                                    await input_field.select_option(label=answer)
                                except Exception:
                                    pass
                            logger.info(f"Filled question '{question_text}'")
                            await page.wait_for_timeout(500)
                    except NeedsAttentionException:
                        raise
                    except Exception as e:
                        logger.warning(f"Could not fill question: {e}")

                # 8. Submit and confirm
                for submit_sel in (
                    'button[type="submit"]',
                    'button:has-text("Submit")',
                    'button:has-text("Apply")',
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

                current_url = page.url.lower()
                page_text = (await page.inner_text("body")).lower()
                modal = None
                try:
                    modal = await page.query_selector('div[role="dialog"]:has-text("submitted")')
                except Exception:
                    pass

                success = (
                    modal is not None
                    or any(kw in current_url for kw in ("confirmation", "thank", "success"))
                    or any(
                        phrase in page_text
                        for phrase in ("application has been submitted", "thank you for applying")
                    )
                )

                if success:
                    return {
                        "success": True,
                        "session_id": session.id,
                        "portal": "ashby",
                        "error": None,
                        "needs_attention": False,
                        "attention_question": None,
                    }
                return {
                    "success": False,
                    "session_id": session.id,
                    "portal": "ashby",
                    "error": "No confirmation detected",
                    "needs_attention": False,
                    "attention_question": None,
                }

        except NeedsAttentionException as e:
            return {
                "success": False,
                "session_id": session.id,
                "portal": "ashby",
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
