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

                # 3. Navigate to the job URL
                await page.goto(job_url, wait_until="networkidle")
                logger.info(f"Navigated to {job_url}")

                # 4. Fill basic fields
                await _fill_if_exists(page, "#first_name", user_data.get("first_name", ""))
                await page.wait_for_timeout(500)
                await _fill_if_exists(page, "#last_name", user_data.get("last_name", ""))
                await page.wait_for_timeout(500)
                await _fill_if_exists(page, "#email", user_data.get("email", ""))
                await page.wait_for_timeout(500)
                await _fill_if_exists(page, "#phone", user_data.get("phone", ""))
                await page.wait_for_timeout(500)
                await _fill_if_exists(page, "#job_application_location", user_data.get("location", ""))
                await page.wait_for_timeout(500)

                for sel in ('input[id*="linkedin" i]', 'input[placeholder*="linkedin" i]'):
                    await _fill_if_exists(page, sel, user_data.get("linkedin_url", ""))
                await page.wait_for_timeout(500)

                for sel in ('input[id*="github" i]', 'input[placeholder*="github" i]'):
                    await _fill_if_exists(page, sel, user_data.get("github_url", ""))
                await page.wait_for_timeout(500)

                for sel in ('input[id*="website" i]', 'input[id*="portfolio" i]'):
                    await _fill_if_exists(page, sel, user_data.get("portfolio_url", ""))
                await page.wait_for_timeout(500)

                # 5. Upload resume
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
                            await page.wait_for_timeout(500)
                            break
                    except Exception as e:
                        logger.warning(f"Resume upload failed for {resume_sel}: {e}")

                os.unlink(tmp_path)
                tmp_path = None

                # 6. Work authorization and sponsorship
                work_auth = user_data.get("work_authorization", "")
                auth_value = _WORK_AUTH_MAP.get(work_auth, "")
                if auth_value:
                    for sel in ('select[id*="work_status" i]', 'select[id*="authorized" i]'):
                        await _select_if_exists(page, sel, auth_value)
                await page.wait_for_timeout(500)

                requires_sponsorship = user_data.get("requires_sponsorship")
                if requires_sponsorship is not None:
                    sponsor_value = "Yes" if requires_sponsorship else "No"
                    await _select_if_exists(page, 'select[id*="sponsor" i]', sponsor_value)
                await page.wait_for_timeout(500)

                # 7. Education fields
                await _fill_if_exists(page, 'input[id*="school" i]', user_data.get("school", ""))
                await page.wait_for_timeout(500)
                await _select_if_exists(page, 'select[id*="degree" i]', user_data.get("degree", ""))
                await page.wait_for_timeout(500)
                gpa = user_data.get("gpa")
                await _fill_if_exists(page, 'input[id*="gpa" i]', str(gpa) if gpa else "")
                await page.wait_for_timeout(500)

                # 8. Custom / open-ended questions
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
                            await page.wait_for_timeout(500)
                    except NeedsAttentionException:
                        raise
                    except Exception as e:
                        logger.warning(f"Could not fill textarea: {e}")

                # 9. Submit and confirm
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
                        "portal": "greenhouse",
                        "error": None,
                        "needs_attention": False,
                        "attention_question": None,
                    }
                return {
                    "success": False,
                    "session_id": session.id,
                    "portal": "greenhouse",
                    "error": "No confirmation detected",
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
