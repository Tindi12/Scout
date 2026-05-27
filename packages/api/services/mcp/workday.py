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
    "us_citizen": "I am a U.S. Citizen",
    "green_card": "I am a Permanent Resident",
    "f1_student": "I have a visa that requires sponsorship",
    "h1b": "I have a visa that requires sponsorship",
    "other_visa": "I have a visa that requires sponsorship",
}

_CONFIRMATION_URL_KEYWORDS = ("confirmation", "thank", "success", "submitted")
_CONFIRMATION_PAGE_PHRASES = (
    "application submitted",
    "thank you for applying",
    "successfully submitted",
    "application has been submitted",
)


# ---------------------------------------------------------------------------
# Module-level helpers (stateless, reused across methods)
# ---------------------------------------------------------------------------

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


async def _select_workday_dropdown(page, container_selector: str, option_text: str) -> None:
    """
    Handle Workday's custom dropdown components.

    Workday renders many dropdowns as <div> containers instead of native <select>.
    Strategy:
      1. Click the container to open the dropdown overlay.
      2. Click the matching div[data-automation-id*="dropdownOption"] item.
      3. Fall back to standard select_option for any native <select> that slipped through.
    """
    if not option_text:
        return
    try:
        container = await page.query_selector(container_selector)
        if not container:
            return
        await container.click()
        await page.wait_for_timeout(600)

        # Workday option items in the floating dropdown panel
        option = await page.query_selector(
            f'div[data-automation-id*="dropdownOption"]:has-text("{option_text}")'
        )
        if option:
            await option.click()
            logger.info(
                f"Selected Workday dropdown '{option_text}' via {container_selector}"
            )
            await page.wait_for_timeout(400)
            return

        # Some Workday instances use li items in the listbox
        option_li = await page.query_selector(
            f'li[role="option"]:has-text("{option_text}")'
        )
        if option_li:
            await option_li.click()
            logger.info(
                f"Selected Workday listbox '{option_text}' via {container_selector}"
            )
            await page.wait_for_timeout(400)
            return

        # Fallback: native <select>
        await page.select_option(container_selector, label=option_text)
        logger.info(
            f"Selected '{option_text}' via standard select_option for {container_selector}"
        )
    except Exception as e:
        logger.warning(
            f"Could not select Workday dropdown {container_selector} → '{option_text}': {e}"
        )


async def _resolve_label(page, element) -> str:
    """
    Best-effort label resolution for a form element.
    Tries: <label for=id>, data-automation-id, placeholder, aria-label, name.
    """
    try:
        el_id = await element.get_attribute("id")
        if el_id:
            label_el = await page.query_selector(f'label[for="{el_id}"]')
            if label_el:
                text = (await label_el.inner_text()).strip()
                if text:
                    return text
    except Exception:
        pass

    for attr in ("data-automation-id", "placeholder", "aria-label", "name"):
        try:
            val = await element.get_attribute(attr)
            if val and val.strip():
                return val.strip()
        except Exception:
            pass

    return ""


def _lookup_answer(question_text: str, company: str, answers_library: dict) -> str | None:
    """Return the first library answer whose key fuzzy-matches the question, else None."""
    q_lower = question_text.lower()
    for key, val in answers_library.items():
        if key.lower() in q_lower or q_lower in key.lower():
            return val.replace("{company}", company)
    return None


def _is_confirmation(url: str, body: str) -> bool:
    return any(kw in url for kw in _CONFIRMATION_URL_KEYWORDS) or any(
        phrase in body for phrase in _CONFIRMATION_PAGE_PHRASES
    )


# ---------------------------------------------------------------------------
# WorkdayMCP
# ---------------------------------------------------------------------------

class WorkdayMCP:
    """
    Browser-automation handler for Workday ATS portals.

    Workday is the most complex portal: heavily JavaScript-driven, custom
    component library, multi-step wizard with unpredictable step counts,
    and non-standard form controls.  All field-fills are best-effort and
    wrapped in try/except so a single missing selector never aborts the run.
    """

    def __init__(self) -> None:
        # Shared state set by apply() before the wizard loop so that
        # _fill_current_step() can access it without extra parameters.
        self._tmp_path: str | None = None
        self._company: str = ""
        self._answers_library: dict = {}
        self._open_ended_preference: str = "library"

    async def apply(self, job_url: str, user_data: dict, resume_pdf: bytes) -> dict:
        bb = Browserbase(api_key=BROWSERBASE_API_KEY)
        session = bb.sessions.create(project_id=BROWSERBASE_PROJECT_ID)
        page = None

        # Resolve shared context once so _fill_current_step doesn't need args
        self._company = user_data.get("company") or job_url.split("/")[2]
        self._answers_library = user_data.get("answers_library", {})
        self._open_ended_preference = user_data.get("open_ended_preference", "library")

        # Write the PDF to disk once; cleaned up in finally regardless of outcome
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(resume_pdf)
            self._tmp_path = tmp.name

        try:
            async with async_playwright() as p:
                browser = await p.chromium.connect_over_cdp(session.connect_url)
                page = await browser.new_page()
                logger.info(f"Playwright connected to session: {session.id}")

                # ----------------------------------------------------------
                # Navigate to the job listing page
                # ----------------------------------------------------------
                await page.goto(job_url, wait_until="networkidle")
                logger.info(f"Navigated to {job_url}")

                # ----------------------------------------------------------
                # Click "Apply" / "Apply Now"
                # ----------------------------------------------------------
                for apply_sel in (
                    '[data-automation-id*="applyButton" i]',
                    'a[data-automation-id*="apply" i]',
                    'button[data-automation-id*="apply" i]',
                    'a:has-text("Apply Now")',
                    'button:has-text("Apply Now")',
                    'a:has-text("Apply")',
                    'button:has-text("Apply")',
                ):
                    try:
                        el = await page.query_selector(apply_sel)
                        if el:
                            await el.click()
                            logger.info(f"Clicked Apply via {apply_sel}")
                            await page.wait_for_load_state("networkidle")
                            await page.wait_for_timeout(3000)
                            break
                    except Exception as e:
                        logger.warning(f"Could not click Apply {apply_sel}: {e}")

                # ----------------------------------------------------------
                # Multi-step wizard loop — up to 10 steps
                # ----------------------------------------------------------
                for step in range(10):
                    await page.wait_for_timeout(2000)
                    logger.info(f"Workday wizard — step {step}")

                    # Wait for Workday's app shell to signal page readiness
                    try:
                        await page.wait_for_selector(
                            '[data-automation-id="applicationTitle"]',
                            timeout=10000,
                        )
                    except Exception:
                        logger.warning(
                            "applicationTitle not found on step %d — proceeding anyway", step
                        )

                    # Fill every field visible on this step (best-effort)
                    await self._fill_current_step(page, user_data)

                    # -- Confirmation check --
                    try:
                        conf_el = await page.query_selector(
                            '[data-automation-id="confirmationTitle"]'
                        )
                        if conf_el:
                            logger.info("Confirmation title detected — wizard complete")
                            break
                    except Exception:
                        pass

                    current_url = page.url.lower()
                    page_body = (await page.inner_text("body")).lower()
                    if _is_confirmation(current_url, page_body):
                        logger.info("Confirmation detected via URL/text on step %d", step)
                        break

                    # -- Submit button (final review step) --
                    submit_loc = page.locator('button:has-text("Submit")')
                    if await submit_loc.count() > 0:
                        await submit_loc.click()
                        logger.info("Clicked Submit button")
                        await page.wait_for_load_state("networkidle")
                        await page.wait_for_timeout(3000)
                        break

                    # -- Next button (advance to next step) --
                    next_loc = page.locator(
                        '[data-automation-id="bottom-navigation-next-button"]'
                    )
                    if await next_loc.count() > 0:
                        await next_loc.click()
                        logger.info("Clicked Next — advancing to step %d", step + 1)
                        await page.wait_for_load_state("networkidle")
                    else:
                        logger.info(
                            "No Next or Submit button found on step %d — wizard complete or stuck",
                            step,
                        )
                        break

                # ----------------------------------------------------------
                # Final confirmation check (after wizard exits)
                # ----------------------------------------------------------
                await page.wait_for_timeout(5000)

                success = False
                try:
                    conf_el = await page.query_selector(
                        '[data-automation-id="confirmationTitle"]'
                    )
                    if conf_el:
                        success = True
                except Exception:
                    pass

                if not success:
                    current_url = page.url.lower()
                    page_body = (await page.inner_text("body")).lower()
                    success = _is_confirmation(current_url, page_body)

                if success:
                    return {
                        "success": True,
                        "session_id": session.id,
                        "portal": "workday",
                        "error": None,
                        "needs_attention": False,
                        "attention_question": None,
                    }
                return {
                    "success": False,
                    "session_id": session.id,
                    "portal": "workday",
                    "error": "No confirmation detected",
                    "needs_attention": False,
                    "attention_question": None,
                }

        except NeedsAttentionException as e:
            return {
                "success": False,
                "session_id": session.id,
                "portal": "workday",
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
            if self._tmp_path:
                try:
                    os.unlink(self._tmp_path)
                except Exception:
                    pass
                self._tmp_path = None
            try:
                bb.sessions.update(session.id, status="REQUEST_RELEASE")
            except Exception:
                pass

    # -----------------------------------------------------------------------
    # _fill_current_step
    # -----------------------------------------------------------------------

    async def _fill_current_step(self, page, user_data: dict) -> None:
        """
        Fill every field that may exist on the current Workday wizard step.

        This method is called on every loop iteration.  All fills are
        best-effort: if a selector doesn't exist on this step the call
        silently returns without error.  Log fills at INFO, misses at WARNING.

        Covers:
          Step 1 — My Information (name, contact, address)
          Step 2 — My Experience  (resume upload, education, links)
          Step 3 — Application Questions (Workday questionText + plain textareas)
          Step 4 — Self-Identify  (diversity — all optional)
          Any step — Work authorization and sponsorship fields
        """
        company = self._company
        answers_library = self._answers_library
        open_ended_preference = self._open_ended_preference

        # ------------------------------------------------------------------ #
        # Step 1 — My Information                                             #
        # ------------------------------------------------------------------ #

        # First name — try automation-id, then aria-label, then id
        for sel in (
            '[data-automation-id="legalNameSection_firstName"]',
            'input[aria-label*="First Name" i]',
            '#firstName',
        ):
            await _fill_if_exists(page, sel, user_data.get("first_name", ""))

        # Last name
        for sel in (
            '[data-automation-id="legalNameSection_lastName"]',
            'input[aria-label*="Last Name" i]',
            '#lastName',
        ):
            await _fill_if_exists(page, sel, user_data.get("last_name", ""))

        # Email
        for sel in (
            '[data-automation-id="email"]',
            'input[data-automation-id*="email" i]',
            'input[aria-label*="Email" i]',
            '#email',
        ):
            await _fill_if_exists(page, sel, user_data.get("email", ""))

        # Phone
        for sel in (
            '[data-automation-id="phone-number"]',
            'input[data-automation-id*="phone" i]',
            'input[aria-label*="Phone" i]',
        ):
            await _fill_if_exists(page, sel, user_data.get("phone", ""))

        # Address line 1
        for sel in (
            '[data-automation-id="addressSection_addressLine1"]',
            'input[data-automation-id*="addressLine1" i]',
            'input[aria-label*="Address" i]',
        ):
            await _fill_if_exists(page, sel, user_data.get("address_street", ""))

        # City
        for sel in (
            '[data-automation-id="addressSection_city"]',
            'input[data-automation-id*="city" i]',
            'input[aria-label*="City" i]',
        ):
            await _fill_if_exists(page, sel, user_data.get("address_city", ""))

        # State / Region — try both text input and Workday dropdown
        state = user_data.get("address_state", "")
        if state:
            for sel in (
                '[data-automation-id="addressSection_countryRegion"]',
                'input[data-automation-id*="countryRegion" i]',
                'input[aria-label*="State" i]',
            ):
                await _fill_if_exists(page, sel, state)
            await _select_workday_dropdown(
                page,
                '[data-automation-id="addressSection_countryRegion"]',
                state,
            )

        # Postal code
        for sel in (
            '[data-automation-id="addressSection_postalCode"]',
            'input[data-automation-id*="postalCode" i]',
            'input[aria-label*="Postal Code" i]',
            'input[aria-label*="Zip" i]',
        ):
            await _fill_if_exists(page, sel, user_data.get("address_zip", ""))

        # Country (Workday custom dropdown)
        country = user_data.get("address_country", "")
        if country:
            await _select_workday_dropdown(
                page,
                '[data-automation-id="addressSection_country"]',
                country,
            )

        # ------------------------------------------------------------------ #
        # Step 2 — My Experience                                              #
        # ------------------------------------------------------------------ #

        # Resume upload — primary path: Workday's upload button + filechooser
        if self._tmp_path:
            upload_done = False
            try:
                upload_btn = await page.query_selector(
                    '[data-automation-id="resumeUploadButton"]'
                )
                if upload_btn:
                    async with page.expect_file_chooser(timeout=5000) as fc_info:
                        await upload_btn.click()
                    fc = await fc_info.value
                    await fc.set_files(self._tmp_path)
                    logger.info("Resume uploaded via resumeUploadButton + filechooser")
                    await page.wait_for_timeout(1500)
                    upload_done = True
            except Exception as e:
                logger.warning(f"Filechooser upload attempt failed: {e}")

            # Fallback: direct set_input_files on any visible file input
            if not upload_done:
                for resume_sel in (
                    'input[type="file"][data-automation-id*="resume" i]',
                    'input[type="file"][id*="resume" i]',
                    'input[type="file"]',
                ):
                    try:
                        el = await page.query_selector(resume_sel)
                        if el:
                            await page.set_input_files(resume_sel, self._tmp_path)
                            logger.info(f"Resume uploaded via fallback {resume_sel}")
                            await page.wait_for_timeout(1500)
                            break
                    except Exception as e:
                        logger.warning(f"Resume fallback upload failed {resume_sel}: {e}")

        # LinkedIn
        linkedin = user_data.get("linkedin_url", "")
        if linkedin:
            for sel in (
                'input[data-automation-id*="linkedin" i]',
                'input[aria-label*="LinkedIn" i]',
                'input[placeholder*="linkedin" i]',
            ):
                await _fill_if_exists(page, sel, linkedin)

        # GitHub
        github = user_data.get("github_url", "")
        if github:
            for sel in (
                'input[data-automation-id*="github" i]',
                'input[aria-label*="GitHub" i]',
                'input[placeholder*="github" i]',
            ):
                await _fill_if_exists(page, sel, github)

        # Portfolio / website
        portfolio = user_data.get("portfolio_url", "")
        if portfolio:
            for sel in (
                'input[data-automation-id*="portfolio" i]',
                'input[data-automation-id*="website" i]',
                'input[aria-label*="Portfolio" i]',
                'input[aria-label*="Website" i]',
                'input[placeholder*="portfolio" i]',
            ):
                await _fill_if_exists(page, sel, portfolio)

        # Work authorization — Workday-specific labels
        work_auth = user_data.get("work_authorization", "")
        auth_label = _WORK_AUTH_MAP.get(work_auth, "")
        if auth_label:
            for sel in (
                '[data-automation-id*="country-work-authorization" i]',
                'select[data-automation-id*="workAuthorization" i]',
                'fieldset:has-text("authorized") select',
                'select[data-automation-id*="work" i]',
            ):
                await _select_workday_dropdown(page, sel, auth_label)
            await page.wait_for_timeout(300)

        # Sponsorship
        requires_sponsorship = user_data.get("requires_sponsorship")
        if requires_sponsorship is not None:
            sponsor_label = "Yes" if requires_sponsorship else "No"
            for sel in (
                'fieldset:has-text("sponsor") select',
                'select[data-automation-id*="sponsor" i]',
            ):
                await _select_workday_dropdown(page, sel, sponsor_label)
                await _select_if_exists(page, sel, sponsor_label)
            # Some companies render sponsorship as radio buttons
            for radio_sel in (
                f'input[type="radio"][name*="sponsor" i][value*="{sponsor_label}" i]',
                f'input[type="radio"][data-automation-id*="sponsor" i][value*="{sponsor_label}" i]',
            ):
                try:
                    el = await page.query_selector(radio_sel)
                    if el:
                        await el.click()
                        logger.info(f"Clicked sponsorship radio: {sponsor_label}")
                except Exception as e:
                    logger.warning(f"Sponsorship radio click failed {radio_sel}: {e}")
            await page.wait_for_timeout(300)

        # ------------------------------------------------------------------ #
        # Step 3 — Application Questions                                      #
        # ------------------------------------------------------------------ #

        # Primary: questions labelled with data-automation-id="questionText"
        question_labels = await page.query_selector_all(
            '[data-automation-id="questionText"]'
        )
        for label_el in question_labels:
            question_text = ""
            try:
                question_text = (await label_el.inner_text()).strip()
                if not question_text:
                    continue

                # Walk up the DOM to the nearest containing block, then
                # look for an answerable input inside it.
                input_field = None
                for input_sel in (
                    "textarea",
                    "input:not([type='hidden']):not([type='radio']):not([type='checkbox'])",
                    "select",
                ):
                    try:
                        parent_handle = await label_el.evaluate_handle(
                            "el => el.closest('[data-automation-id]') || el.parentElement"
                        )
                        input_field = await parent_handle.query_selector(input_sel)
                        if input_field:
                            break
                    except Exception:
                        pass

                if not input_field:
                    continue

                tag_name = await input_field.evaluate("el => el.tagName.toLowerCase()")
                answer = _lookup_answer(question_text, company, answers_library)

                if answer is None:
                    if open_ended_preference == "auto":
                        answer = await generate_open_ended_answer(
                            question_text, user_data, company
                        )
                    elif open_ended_preference in ("sms", "email"):
                        raise NeedsAttentionException(question_text)

                if answer:
                    if tag_name in ("input", "textarea"):
                        await input_field.fill(answer)
                    elif tag_name == "select":
                        try:
                            await input_field.select_option(label=answer)
                        except Exception:
                            # Try Workday custom dropdown by the element's id
                            el_id = await input_field.get_attribute("id") or ""
                            if el_id:
                                await _select_workday_dropdown(
                                    page, f'[id="{el_id}"]', answer
                                )
                    logger.info(f"Filled question '{question_text}'")
                    await page.wait_for_timeout(300)

            except NeedsAttentionException:
                raise
            except Exception as e:
                logger.warning(f"Could not fill question '{question_text}': {e}")

        # Secondary: plain textareas not associated with a questionText label
        textareas = await page.query_selector_all("textarea")
        for textarea in textareas:
            label_text = ""
            try:
                label_text = await _resolve_label(page, textarea)
                if not label_text:
                    continue

                answer = _lookup_answer(label_text, company, answers_library)
                if answer is None:
                    if open_ended_preference == "auto":
                        answer = await generate_open_ended_answer(
                            label_text, user_data, company
                        )
                    elif open_ended_preference in ("sms", "email"):
                        raise NeedsAttentionException(label_text)

                if answer:
                    await textarea.fill(answer)
                    logger.info(f"Filled textarea '{label_text}'")
                    await page.wait_for_timeout(300)

            except NeedsAttentionException:
                raise
            except Exception as e:
                logger.warning(f"Could not fill textarea '{label_text}': {e}")

        # ------------------------------------------------------------------ #
        # Step 4 — Self-Identify (diversity — all fields optional)            #
        # ------------------------------------------------------------------ #

        gender = user_data.get("gender_identity", "")
        if gender:
            for sel in (
                'select[data-automation-id*="gender" i]',
                'div[data-automation-id*="gender" i]',
            ):
                await _select_workday_dropdown(page, sel, gender)
            await page.wait_for_timeout(300)

        race = user_data.get("race_ethnicity", "")
        if race:
            for sel in (
                'select[data-automation-id*="ethnicity" i]',
                'select[data-automation-id*="race" i]',
                'div[data-automation-id*="ethnicity" i]',
                'div[data-automation-id*="race" i]',
            ):
                await _select_workday_dropdown(page, sel, race)
            await page.wait_for_timeout(300)

        veteran = user_data.get("veteran_status", "")
        if veteran:
            for sel in (
                'select[data-automation-id*="veteran" i]',
                'div[data-automation-id*="veteran" i]',
            ):
                await _select_workday_dropdown(page, sel, veteran)
            await page.wait_for_timeout(300)

        disability = user_data.get("disability_status", "")
        if disability:
            for sel in (
                'select[data-automation-id*="disability" i]',
                'div[data-automation-id*="disability" i]',
            ):
                await _select_workday_dropdown(page, sel, disability)
            await page.wait_for_timeout(300)
