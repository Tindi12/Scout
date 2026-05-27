import logging
import os
import tempfile
from dotenv import load_dotenv

from browser_use import Agent, Browser, BrowserProfile
from browser_use.agent.views import AgentHistoryList
from browserbase import Browserbase

from services.browser_llm import ScoutBrowserLLM

logger = logging.getLogger(__name__)
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
BROWSERBASE_API_KEY = os.getenv("BROWSERBASE_API_KEY")
BROWSERBASE_PROJECT_ID = os.getenv("BROWSERBASE_PROJECT_ID")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GEMINI_API_KEY and not GROQ_API_KEY:
    raise RuntimeError("GEMINI_API_KEY or GROQ_API_KEY must be set for browser agent")
if not BROWSERBASE_API_KEY:
    raise RuntimeError("BROWSERBASE_API_KEY not set")
if not BROWSERBASE_PROJECT_ID:
    raise RuntimeError("BROWSERBASE_PROJECT_ID not set")


def _interpret_agent_result(result: AgentHistoryList) -> dict:
    """Map browser-use AgentHistoryList to Scout apply result."""
    if result.has_errors():
        errors = [e for e in result.errors() if e]
        combined = " ".join(errors).lower()
        if any(
            token in combined
            for token in ("429", "resource_exhausted", "quota", "rate limit")
        ):
            return {
                "success": False,
                "error": "AI quota exceeded — try again later or enable billing on Gemini",
                "needs_attention": False,
            }
        return {
            "success": False,
            "error": errors[0] if errors else "Browser agent failed",
            "needs_attention": False,
        }

    agent_success = result.is_successful()
    if agent_success is True:
        return {"success": True, "error": None, "needs_attention": False}
    if agent_success is False:
        return {
            "success": False,
            "error": result.final_result() or "Agent reported failure",
            "needs_attention": False,
        }

    final = (result.final_result() or "").lower()
    if "captcha" in final:
        return {
            "success": False,
            "error": "CAPTCHA detected",
            "needs_attention": True,
            "attention_question": "CAPTCHA verification required — please apply manually",
        }

    success = any(
        word in final
        for word in (
            "submitted",
            "application received",
            "thank you",
            "confirmed",
        )
    )
    return {
        "success": success,
        "error": None if success else "Could not confirm submission",
        "needs_attention": False,
    }


class BrowserUseAgent:
    def __init__(self):
        self.llm = ScoutBrowserLLM(task="quality", temperature=0)
        self.bb = Browserbase(api_key=BROWSERBASE_API_KEY)

    async def apply(self, job_url: str, user_data: dict, resume_pdf: bytes) -> dict:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(resume_pdf)
            tmp_path = tmp.name

        session = self.bb.sessions.create(project_id=BROWSERBASE_PROJECT_ID, browser_settings={"session_timeout": 900})
        logger.info(f"Browserbase session created: {session.id}")

        browser = Browser(
            browser_profile=BrowserProfile(cdp_url=session.connect_url)
        )

        # Extract user info
        name_parts = user_data.get("name", "").split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        # Format answers library
        answers = user_data.get("answers_library", {})
        answers_text = "\n".join([
            f"- {k.replace('_', ' ').title()}: {v}"
            for k, v in answers.items() if v
        ])

        # Work authorization mapping
        work_auth = user_data.get("work_authorization", "us_citizen")
        auth_map = {
            "us_citizen": "Yes, I am authorized to work in the US",
            "green_card": "Yes, I am authorized to work in the US",
            "f1_student": "No, I require sponsorship",
            "h1b": "No, I require sponsorship",
            "other_visa": "No, I require sponsorship",
        }
        auth_answer = auth_map.get(work_auth, "Yes")
        sponsorship = "Yes" if user_data.get("requires_sponsorship") else "No"

        city = user_data.get("address_city") or ""
        state = user_data.get("address_state") or ""
        street = user_data.get("address_street") or ""
        zipcode = user_data.get("address_zip") or ""
        address_lines = "\n        ".join(
            line
            for line in (
                f"- Street address: {street}" if street else "",
                f"- City: {city}" if city else "",
                f"- State: {state}" if state else "",
                f"- Zip / Postal code: {zipcode}" if zipcode else "",
            )
            if line
        )

        task = f"""
        Go to this job application URL and complete the application form:
        {job_url}

        Fill in the following information:
        - First name: {first_name}
        - Last name: {last_name}
        - Email: {user_data.get('email', '')}
        - Phone: {user_data.get('phone_number', '')}
        {address_lines}
        - Country: {user_data.get('address_country') or 'United States'}
        - LinkedIn: {user_data.get('linkedin_url', '')}
        - GitHub: {user_data.get('github_url', '')}
        - University/School: {user_data.get('school', '')}
        - Degree: {user_data.get('degree_type', '')}
        - GPA: {user_data.get('gpa', '')}

        Upload the resume from this file path: {tmp_path}

        Work authorization question: {auth_answer}
        Requires visa sponsorship: {sponsorship}

        For any open-ended text questions use these answers:
        {answers_text if answers_text else "Use professional, concise answers based on the applicant's background."}

        Important instructions:
        - Fill every required field before submitting
        - If you see a CAPTCHA, stop and report it
        - Upload the resume file when asked
        - Click submit only when all required fields are filled
        - Confirm the application was submitted successfully
        - If the form has errors after submit, report what fields failed
        """

        try:
            agent = Agent(task=task, llm=self.llm, browser=browser, available_file_paths=[tmp_path])
            result = await agent.run()
            logger.info(f"Agent completed for {job_url}: {result}")

            if not isinstance(result, AgentHistoryList):
                result = AgentHistoryList.model_validate(result)

            outcome = _interpret_agent_result(result)
            return {
                "portal": "browser_use",
                "session_id": session.id,
                **outcome,
            }

        except Exception as e:
            logger.error(f"BrowserUseAgent failed: {e}")
            return {
                "success": False,
                "portal": "browser_use",
                "session_id": session.id if session else None,
                "error": str(e),
                "needs_attention": False
            }

        finally:
            try:
                await browser.stop()
            except Exception:
                pass
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            try:
                self.bb.sessions.update(
                    session.id,
                    status="REQUEST_RELEASE"
                )
            except Exception:
                pass


browser_agent = BrowserUseAgent()
