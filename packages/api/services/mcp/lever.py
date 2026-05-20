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


def _build_cover_letter(template: str, user_data: dict, company: str) -> str:
    return (
        template
        .replace("{company}", company)
        .replace("{role}", user_data.get("role") or user_data.get("job_title", ""))
        .replace("{school}", user_data.get("school", ""))
        .replace("{year}", str(user_data.get("graduation_year", "")))
        .replace("{degree}", user_data.get("degree", ""))
        .replace("{major}", user_data.get("major", ""))
    )


class LeverMCP:
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

                # 3. Navigate to the job URL
                await page.goto(job_url, wait_until="networkidle")
                logger.info(f"Navigated to {job_url}")

                # 4. Fill basic fields
                full_name = user_data.get("name") or (
                    f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip()
                )
                await _fill_if_exists(page, 'input[name="name"]', full_name)
                await page.wait_for_timeout(500)
                await _fill_if_exists(page, 'input[name="email"]', user_data.get("email", ""))
                await page.wait_for_timeout(500)
                await _fill_if_exists(page, 'input[name="phone"]', user_data.get("phone", ""))
                await page.wait_for_timeout(500)
                await _fill_if_exists(page, 'input[name="location"]', user_data.get("location", ""))
                await page.wait_for_timeout(500)

                for sel in ('input[name="urls[LinkedIn]"]', 'input[placeholder*="linkedin" i]'):
                    await _fill_if_exists(page, sel, user_data.get("linkedin_url", ""))
                await page.wait_for_timeout(500)

                for sel in ('input[name="urls[GitHub]"]', 'input[placeholder*="github" i]'):
                    await _fill_if_exists(page, sel, user_data.get("github_url", ""))
                await page.wait_for_timeout(500)

                for sel in ('input[name="urls[Portfolio]"]', 'input[name="urls[Other]"]'):
                    await _fill_if_exists(page, sel, user_data.get("portfolio_url", ""))
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
                except Exception as e:
                    logger.warning(f"Resume upload failed: {e}")

                os.unlink(tmp_path)
                tmp_path = None

                # 6. Cover letter
                company = user_data.get("company") or job_url.split("/")[2]
                cover_letter_template = user_data.get("default_cover_letter", "")
                if cover_letter_template:
                    cover_letter = _build_cover_letter(cover_letter_template, user_data, company)
                    for sel in ('textarea[name="comments"]', 'textarea[placeholder*="cover" i]'):
                        try:
                            el = await page.query_selector(sel)
                            if el:
                                await el.fill(cover_letter)
                                logger.info(f"Filled cover letter via {sel}")
                                await page.wait_for_timeout(500)
                                break
                        except Exception as e:
                            logger.warning(f"Could not fill cover letter {sel}: {e}")

                # 7. Work authorization
                work_auth = user_data.get("work_authorization", "")
                auth_value = _WORK_AUTH_MAP.get(work_auth, "")
                if auth_value:
                    for sel in ('select[name*="work" i]', 'select[name*="authorized" i]'):
                        await _select_if_exists(page, sel, auth_value)
                    try:
                        radio = await page.query_selector(
                            f'input[type="radio"][name*="authorized" i][value*="{auth_value}" i]'
                        )
                        if radio:
                            await radio.click()
                            logger.info(f"Selected work auth radio: {auth_value}")
                    except Exception as e:
                        logger.warning(f"Could not click work auth radio: {e}")
                await page.wait_for_timeout(500)

                # 8. Custom questions
                answers_library: dict = user_data.get("answers_library", {})
                open_ended_preference: str = user_data.get("open_ended_preference", "library")
                questions = await page.query_selector_all(".application-question")

                for question in questions:
                    try:
                        label_el = await question.query_selector("label")
                        question_text = (await label_el.inner_text()).strip() if label_el else ""

                        input_field = await question.query_selector("input, textarea, select")
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

                # 9. Submit and confirm
                for submit_sel in (
                    'button[type="submit"]',
                    'button:has-text("Submit application")',
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
                success = (
                    any(kw in current_url for kw in ("confirmation", "thank", "success"))
                    or any(
                        phrase in page_text
                        for phrase in ("application has been submitted", "thank you for applying")
                    )
                )

                if success:
                    return {
                        "success": True,
                        "session_id": session.id,
                        "portal": "lever",
                        "error": None,
                        "needs_attention": False,
                        "attention_question": None,
                    }
                return {
                    "success": False,
                    "session_id": session.id,
                    "portal": "lever",
                    "error": "No confirmation detected",
                    "needs_attention": False,
                    "attention_question": None,
                }

        except NeedsAttentionException as e:
            return {
                "success": False,
                "session_id": session.id,
                "portal": "lever",
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
