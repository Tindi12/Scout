import asyncio
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

import httpx
from dotenv import load_dotenv
from starlette.concurrency import run_in_threadpool

load_dotenv()

logger = logging.getLogger(__name__)

ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID")
ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY")
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
USAJOBS_EMAIL = os.getenv("USAJOBS_EMAIL", "tindibrown12@gmail.com")
USAJOBS_API_KEY = os.getenv("USAJOBS_API_KEY")

if not ADZUNA_APP_ID or not ADZUNA_APP_KEY:
    raise RuntimeError("ADZUNA_APP_ID and ADZUNA_APP_KEY must be set")

DATA_DIR = Path(__file__).parent.parent / "data"

COMMON_SKILLS = [
    "Python", "Java", "C++", "JavaScript", "TypeScript",
    "React", "Node.js", "SQL", "AWS", "Docker", "Git",
    "Machine Learning", "Data Analysis", "MATLAB", "CAD",
    "SolidWorks", "AutoCAD", "ANSYS", "Excel", "R",
    "TensorFlow", "PyTorch", "Kubernetes", "Linux",
    "VHDL", "Simulink", "LabVIEW", "Revit", "ArcGIS",
    "Aspen Plus", "HYSYS", "COMSOL", "MCNP",
]

NO_SPONSORSHIP_PHRASES = [
    "no sponsorship",
    "must be authorized to work",
    "cannot sponsor",
    "us citizen or permanent resident only",
    "must be a us citizen",
    "security clearance required",
]

# Internship/co-op only — do not keep bare new-grad / junior / seasonal titles.
INTERNSHIP_PATTERNS = [
    re.compile(r"\bintern(?:ship|ships)?\b", re.I),
    re.compile(r"\bco[\s-]?op\b", re.I),
    re.compile(r"\bstudent\s+intern(?:ship)?\b", re.I),
    re.compile(r"\bundergraduate\s+intern(?:ship)?\b", re.I),
    re.compile(r"\bgraduate\s+intern(?:ship)?\b", re.I),
    re.compile(r"\bphd\s+intern(?:ship)?\b", re.I),
]

# Kept for backwards-compatible imports/tests that still reference these names.
KEEP_KEYWORDS = [
    "intern", "internship", "co-op", "coop", "co op",
    "student intern", "undergraduate intern", "graduate intern", "phd intern",
]

EXCLUDE_KEYWORDS = [
    "senior", "staff", "principal", "director",
    "manager", "lead", "head of", "vp ",
    "vice president", "chief", "architect",
    "consultant", "partner", "associate director",
    "sr.", "sr ", " ii ", " iii ", " iv ",
    "distinguished", "fellow", "executive",
]

# Target recruiting seasons: Spring / Summer / Fall 2027.
TARGET_YEAR = 2027
PAST_YEARS = (2024, 2025, 2026)
SEASON_WORDS = r"(?:spring|summer|fall|autumn|winter)"
# "Spring 2027", "Summer/Fall 2027", bare "2027", "Spring/Summer 2027"
_TARGET_YEAR_RE = re.compile(
    rf"\b(?:{SEASON_WORDS}(?:\s*/\s*{SEASON_WORDS})?\s+)?{TARGET_YEAR}\b",
    re.I,
)
# Past academic seasons / years — exclude even if still labeled intern/co-op.
_PAST_YEAR_RE = re.compile(
    rf"\b(?:{SEASON_WORDS}(?:\s*/\s*{SEASON_WORDS})?\s+)?(?:{'|'.join(str(y) for y in PAST_YEARS)})\b",
    re.I,
)
# No-year intern/co-op posts kept when freshly posted (volume over exact strings).
NO_YEAR_MAX_AGE_DAYS = 120
_DESC_SNIPPET_CHARS = 800

ADZUNA_QUERIES = [
    "software engineering intern",
    "chemical engineering intern",
    "mechanical engineering intern",
    "electrical engineering intern",
    "data science intern",
    "machine learning intern",
    "research intern",
    "aerospace engineering intern",
    "biomedical engineering intern",
    "civil engineering intern",
    "nuclear engineering intern",
    "environmental engineering intern",
    "computer science intern",
    "cybersecurity intern",
    "hardware engineering intern",
]

JSEARCH_QUERIES = [
    "software engineering internship",
    "chemical engineering internship",
    "mechanical engineering internship",
    "electrical engineering internship",
    "data science internship",
    "machine learning internship",
    "research internship",
    "aerospace internship",
    "computer science internship",
    "cybersecurity internship",
]

USAJOBS_QUERIES = ["intern", "student trainee", "pathways intern"]


class _HTMLStripper(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def get_text(self) -> str:
        return " ".join(self._parts)


def _strip_html(raw: str) -> str:
    stripper = _HTMLStripper()
    stripper.feed(raw or "")
    return re.sub(r"\s+", " ", stripper.get_text()).strip()


def _load_json(path: Path) -> list | dict:
    with open(path) as f:
        return json.load(f)


def _skill_in_description(skill: str, desc_lower: str) -> bool:
    s = skill.lower().strip()
    if not s:
        return False
    # Single-letter skills like "R" must not match every word with "r" in it.
    if len(s) <= 2:
        if s == "r":
            return bool(
                re.search(
                    r"\b(r programming|r language|r studio|r\b(?=\s*(lang|programming|stats)))",
                    desc_lower,
                )
            )
        return bool(re.search(rf"\b{re.escape(s)}\b", desc_lower))
    if "+" in s:
        return s in desc_lower
    return s in desc_lower


def extract_skills(description: str) -> list[str]:
    desc_lower = description.lower()
    return [skill for skill in COMMON_SKILLS if _skill_in_description(skill, desc_lower)]


def _slug_matches_company(slug: str, company_lower: str) -> bool:
    return slug in company_lower or company_lower.startswith(slug)


def get_visa_status(company: str, description: str) -> str:
    desc_lower = description.lower()
    for phrase in NO_SPONSORSHIP_PHRASES:
        if phrase in desc_lower:
            return "no"

    try:
        with open(DATA_DIR / "visa_sponsorship.json") as f:
            visa_data = json.load(f)

        company_lower = company.lower()
        for slug in visa_data.get("clearance_required", []):
            if _slug_matches_company(slug, company_lower):
                return "clearance"
        for slug in visa_data.get("cpt_opt_friendly", []):
            if _slug_matches_company(slug, company_lower):
                return "yes"
        for slug in visa_data.get("no_sponsorship", []):
            if _slug_matches_company(slug, company_lower):
                return "no"
    except Exception as e:
        logger.warning("Could not load visa_sponsorship.json: %s", e)

    return "unknown"


def get_expires_at() -> str:
    return (datetime.now(tz=timezone.utc) + timedelta(days=14)).isoformat()


def is_remote(location: str) -> bool:
    loc = location.lower()
    return "remote" in loc or "anywhere" in loc


def _listing_text(listing: dict) -> str:
    title = listing.get("title") or ""
    desc = (listing.get("description") or "")[:_DESC_SNIPPET_CHARS]
    return f"{title}\n{desc}"


def _has_internship_signal(text: str) -> bool:
    return any(p.search(text) for p in INTERNSHIP_PATTERNS)


def _has_exclude_title(title: str) -> bool:
    title_lower = title.lower()
    return any(e in title_lower for e in EXCLUDE_KEYWORDS)


_RELATIVE_POSTED_RE = re.compile(
    r"posted\s+(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago",
    re.I,
)


def _parse_posted_at(value, *, now: datetime | None = None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    # Workday CXS often returns "Posted 12 Days Ago" instead of an ISO timestamp.
    m = _RELATIVE_POSTED_RE.search(raw)
    if not m:
        return None
    amount = int(m.group(1))
    unit = m.group(2).lower()
    ref = now or datetime.now(tz=timezone.utc)
    delta = {
        "second": timedelta(seconds=amount),
        "minute": timedelta(minutes=amount),
        "hour": timedelta(hours=amount),
        "day": timedelta(days=amount),
        "week": timedelta(weeks=amount),
        "month": timedelta(days=30 * amount),
        "year": timedelta(days=365 * amount),
    }.get(unit)
    if delta is None:
        return None
    return ref - delta


def _posted_at_iso(value, *, now: datetime | None = None) -> str:
    """Coerce any source posted_at into a timestamptz-safe ISO string."""
    parsed = _parse_posted_at(value, now=now)
    if parsed is not None:
        return parsed.isoformat()
    return (now or datetime.now(tz=timezone.utc)).isoformat()


def internship_keep_reason(listing: dict, *, now: datetime | None = None) -> str | None:
    """Return a short keep reason, or None if the listing should be dropped."""
    title = listing.get("title") or ""
    text = _listing_text(listing)

    if _has_exclude_title(title):
        return None
    if not _has_internship_signal(text):
        return None

    # Past-year / past-season labels are stale even if still listed as intern/co-op.
    if _PAST_YEAR_RE.search(text):
        return None

    if _TARGET_YEAR_RE.search(text):
        return "target_year_2027"

    ref = now or datetime.now(tz=timezone.utc)
    posted_at = _parse_posted_at(listing.get("posted_at"), now=ref)
    if posted_at is None:
        return None
    age = ref - posted_at.astimezone(timezone.utc)
    if age <= timedelta(days=NO_YEAR_MAX_AGE_DAYS):
        return "recent_no_year"
    return None


def filter_internships(listings: list[dict], *, now: datetime | None = None) -> list[dict]:
    """Keep internship/co-op roles for Spring/Summer/Fall 2027 (+ recent no-year)."""
    results = []
    for listing in listings:
        if internship_keep_reason(listing, now=now):
            results.append(listing)
    return results


# ── Adzuna ────────────────────────────────────────────────────────────────────

async def _fetch_adzuna_query(client: httpx.AsyncClient, query: str) -> list[dict]:
    url = "https://api.adzuna.com/v1/api/jobs/us/search/1"
    params = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_APP_KEY,
        "what": query,
        "results_per_page": 50,
    }
    try:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("Adzuna query '%s' failed: %s", query, e)
        return []

    results = []
    for listing in data.get("results", []):
        description = _strip_html(listing.get("description") or "")
        company = (listing.get("company") or {}).get("display_name") or ""
        location = (listing.get("location") or {}).get("display_name") or ""
        results.append({
            "title": listing.get("title") or "",
            "company": company,
            "location": location,
            "remote": is_remote(location),
            "description": description,
            "skills_required": extract_skills(description),
            "url": listing.get("redirect_url") or "",
            "source": "adzuna",
            "portal": "unknown",
            "posted_at": listing.get("created", datetime.now(tz=timezone.utc).isoformat()),
            "expires_at": get_expires_at(),
            "visa_sponsorship": get_visa_status(company, description),
        })
    return results


async def fetch_adzuna_jobs() -> list[dict]:
    async with httpx.AsyncClient(timeout=30, headers={"Accept": "application/json"}) as client:
        batches = await asyncio.gather(
            *[_fetch_adzuna_query(client, q) for q in ADZUNA_QUERIES],
            return_exceptions=True,
        )

    seen: set[str] = set()
    results: list[dict] = []
    for batch in batches:
        if isinstance(batch, Exception):
            logger.error("Adzuna batch error: %s", batch)
            continue
        for job in batch:
            url = job.get("url", "")
            if url and url not in seen:
                seen.add(url)
                results.append(job)
            elif not url:
                results.append(job)

    logger.info("Adzuna: fetched %d listings across %d queries", len(results), len(ADZUNA_QUERIES))
    return results


# ── Greenhouse ────────────────────────────────────────────────────────────────

async def fetch_greenhouse_jobs() -> list[dict]:
    slugs: list[str] = await run_in_threadpool(_load_json, DATA_DIR / "greenhouse_companies.json")
    results = []

    async with httpx.AsyncClient(timeout=30) as client:
        for slug in slugs:
            await asyncio.sleep(0.5)
            url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
            try:
                resp = await client.get(url, params={"content": "true"})
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError:
                continue
            except Exception as e:
                logger.error("Greenhouse error for %s: %s", slug, e)
                continue

            company = slug.replace("-", " ").title()
            for job in data.get("jobs", []):
                description = _strip_html(job.get("content") or "")
                location = (job.get("location") or {}).get("name") or ""
                results.append({
                    "title": job.get("title") or "",
                    "company": company,
                    "location": location,
                    "remote": is_remote(location),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": job.get("absolute_url") or "",
                    "source": "greenhouse",
                    "portal": "greenhouse",
                    "posted_at": job.get("updated_at", datetime.now(tz=timezone.utc).isoformat()),
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company, description),
                })

    logger.info("Greenhouse: fetched %d listings", len(results))
    return results


# ── Lever ─────────────────────────────────────────────────────────────────────

async def fetch_lever_jobs() -> list[dict]:
    slugs: list[str] = await run_in_threadpool(_load_json, DATA_DIR / "lever_companies.json")
    results = []

    async with httpx.AsyncClient(timeout=30) as client:
        for slug in slugs:
            url = f"https://api.lever.co/v0/postings/{slug}"
            try:
                resp = await client.get(url, params={"mode": "json"})
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                postings = resp.json()
            except httpx.HTTPStatusError:
                continue
            except Exception as e:
                logger.error("Lever error for %s: %s", slug, e)
                continue

            company = slug.replace("-", " ").title()
            for posting in (postings if isinstance(postings, list) else []):
                categories = posting.get("categories") or {}
                location = categories.get("location") or ""
                created_ms = posting.get("createdAt") or 0
                try:
                    posted_at = datetime.fromtimestamp(
                        created_ms / 1000, tz=timezone.utc
                    ).isoformat()
                except Exception:
                    posted_at = datetime.now(tz=timezone.utc).isoformat()

                description = posting.get("descriptionPlain") or ""
                results.append({
                    "title": posting.get("text") or "",
                    "company": company,
                    "location": location,
                    "remote": is_remote(location),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": posting.get("hostedUrl") or "",
                    "source": "lever",
                    "portal": "lever",
                    "posted_at": posted_at,
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company, description),
                })

    logger.info("Lever: fetched %d listings", len(results))
    return results


# ── Ashby ─────────────────────────────────────────────────────────────────────

async def fetch_ashby_jobs() -> list[dict]:
    logger.info("Starting ashby fetch...")
    ashby_path = DATA_DIR / "ashby_companies.json"
    slugs: list[str] = await run_in_threadpool(_load_json, ashby_path)
    results = []

    async with httpx.AsyncClient(timeout=30) as client:
        for slug in slugs:
            await asyncio.sleep(0.3)
            url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
            try:
                resp = await client.get(url)
                logger.info("Got response: %d from %s", resp.status_code, url)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError:
                continue
            except Exception as e:
                logger.error("Ashby error for %s: %s", slug, e)
                continue

            jobs = data.get("jobs", [])
            if not jobs:
                logger.info("No jobs found from ashby: %s", resp.text[:200])
                continue

            company = slug.replace("-", " ").title()
            for job in jobs:
                if not job.get("isListed", False):
                    continue
                location = job.get("location") or "Not specified"
                description = _strip_html(job.get("descriptionHtml", ""))
                results.append({
                    "title": job.get("title") or "",
                    "company": company,
                    "location": location,
                    "remote": job.get("isRemote") or False,
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": f"https://jobs.ashbyhq.com/{slug}/{job['id']}",
                    "source": "ashby",
                    "portal": "ashby",
                    "posted_at": job.get("publishedAt", datetime.now(tz=timezone.utc).isoformat()),
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company, description),
                })

    logger.info("Ashby: fetched %d listings", len(results))
    return results


# ── JSearch ───────────────────────────────────────────────────────────────────

async def _fetch_jsearch_query(client: httpx.AsyncClient, query: str) -> list[dict]:
    url = "https://jsearch.p.rapidapi.com/search"
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    }
    params = {
        "query": query,
        "page": 1,
        "num_pages": 1,
        "date_posted": "month",
    }
    try:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("JSearch query '%s' failed: %s", query, e)
        return []

    results = []
    for job in data.get("data", []):
        city = job.get("job_city") or ""
        state = job.get("job_state") or ""
        location = f"{city}, {state}".strip(", ")
        description = (job.get("job_description") or "")[:2000]
        company = job.get("employer_name") or ""
        results.append({
            "title": job.get("job_title") or "",
            "company": company,
            "location": location,
            "remote": job.get("job_is_remote") or False,
            "description": description,
            "skills_required": job.get("job_required_skills") or [],
            "url": job.get("job_apply_link") or "",
            "source": "jsearch",
            "portal": "unknown",
            "posted_at": job.get("job_posted_at_datetime_utc", datetime.now(tz=timezone.utc).isoformat()),
            "expires_at": get_expires_at(),
            "visa_sponsorship": get_visa_status(company, description),
        })
    return results


async def fetch_jsearch_jobs() -> list[dict]:
    if not RAPIDAPI_KEY:
        logger.warning("RAPIDAPI_KEY not set — skipping JSearch")
        return []

    async with httpx.AsyncClient(timeout=30) as client:
        batches = await asyncio.gather(
            *[_fetch_jsearch_query(client, q) for q in JSEARCH_QUERIES],
            return_exceptions=True,
        )

    seen: set[str] = set()
    results: list[dict] = []
    for batch in batches:
        if isinstance(batch, Exception):
            logger.error("JSearch batch error: %s", batch)
            continue
        for job in batch:
            url = job.get("url", "")
            if url and url not in seen:
                seen.add(url)
                results.append(job)
            elif not url:
                results.append(job)

    logger.info("JSearch: fetched %d listings across %d queries", len(results), len(JSEARCH_QUERIES))
    return results


# ── The Muse ──────────────────────────────────────────────────────────────────

async def _fetch_muse_page(client: httpx.AsyncClient, page: int) -> list[dict]:
    url = "https://www.themuse.com/api/public/jobs"
    params = {
        "page": page,
        "descending": "true",
    }
    try:
        resp = await client.get(url, params=params)
        logger.info("Got response: %d from %s (page %d)", resp.status_code, url, page)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("Muse page %d failed: %s", page, e)
        return []

    results = []
    for job in data.get("results", []):
        locations = job.get("locations", [])
        location = locations[0]["name"] if locations else "Remote"
        description = _strip_html((job.get("contents") or "")[:2000])
        company = (job.get("company") or {}).get("name") or ""
        results.append({
            "title": job.get("name") or "",
            "company": company,
            "location": location,
            "remote": "remote" in location.lower(),
            "description": description,
            "skills_required": extract_skills(description),
            "url": (job.get("refs") or {}).get("landing_page") or "",
            "source": "muse",
            "portal": "unknown",
            "posted_at": job.get("publication_date", datetime.now(tz=timezone.utc).isoformat()),
            "expires_at": get_expires_at(),
            "visa_sponsorship": get_visa_status(company, description),
        })

    if not results:
        logger.info("No jobs found from muse page %d: %s", page, resp.text[:200])

    return results


async def fetch_muse_jobs() -> list[dict]:
    logger.info("Starting muse fetch...")
    async with httpx.AsyncClient(timeout=30) as client:
        batches = await asyncio.gather(
            _fetch_muse_page(client, 0),
            _fetch_muse_page(client, 1),
            _fetch_muse_page(client, 2),
            return_exceptions=True,
        )

    results: list[dict] = []
    for batch in batches:
        if isinstance(batch, Exception):
            logger.error("Muse batch error: %s", batch)
            continue
        results.extend(batch)

    logger.info("Muse: fetched %d listings", len(results))
    return results


# ── USAJobs ───────────────────────────────────────────────────────────────────

async def _fetch_usajobs_query(client: httpx.AsyncClient, keyword: str) -> list[dict]:
    url = "https://data.usajobs.gov/api/search"
    headers = {
        "Host": "data.usajobs.gov",
        "User-Agent": USAJOBS_EMAIL,
        "Authorization-Key": USAJOBS_API_KEY,
    }
    params = {
        "Keyword": keyword,
        "ResultsPerPage": 50,
    }
    try:
        resp = await client.get(url, headers=headers, params=params)
        logger.info("Got response: %d from %s (keyword=%s)", resp.status_code, url, keyword)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("USAJobs query '%s' failed: %s", keyword, e)
        return []

    results = []
    items = data.get("SearchResult", {}).get("SearchResultItems", [])
    if not items:
        logger.info("No jobs found from usajobs (keyword=%s): %s", keyword, resp.text[:200])

    for item in items:
        desc = item.get("MatchedObjectDescriptor") or {}
        apply_uris = desc.get("ApplyURI") or []
        description = ((desc.get("UserArea") or {}).get("Details") or {}).get("JobSummary") or ""
        results.append({
            "title": desc.get("PositionTitle") or "",
            "company": desc.get("OrganizationName") or "",
            "location": desc.get("PositionLocationDisplay") or "",
            "remote": False,
            "description": description,
            "skills_required": extract_skills(description),
            "url": apply_uris[0] if apply_uris else "",
            "source": "usajobs",
            "portal": "usajobs",
            "posted_at": desc.get("PublicationStartDate", datetime.now(tz=timezone.utc).isoformat()),
            "expires_at": get_expires_at(),
            "visa_sponsorship": "no",
        })
    return results


async def fetch_usajobs_jobs() -> list[dict]:
    if not USAJOBS_API_KEY:
        logger.warning("USAJOBS_API_KEY not set, skipping USAJobs")
        return []
    logger.info("Starting usajobs fetch...")
    async with httpx.AsyncClient(timeout=30) as client:
        batches = await asyncio.gather(
            *[_fetch_usajobs_query(client, q) for q in USAJOBS_QUERIES],
            return_exceptions=True,
        )

    seen: set[str] = set()
    results: list[dict] = []
    for batch in batches:
        if isinstance(batch, Exception):
            logger.error("USAJobs batch error: %s", batch)
            continue
        for job in batch:
            url = job.get("url", "")
            if url and url not in seen:
                seen.add(url)
                results.append(job)
            elif not url:
                results.append(job)

    logger.info("USAJobs: fetched %d listings across %d queries", len(results), len(USAJOBS_QUERIES))
    return results


# ── Workday ───────────────────────────────────────────────────────────────────

async def fetch_workday_jobs() -> list[dict]:
    companies: list[dict] = await run_in_threadpool(_load_json, DATA_DIR / "workday_companies.json")
    results = []

    async with httpx.AsyncClient(timeout=30, headers={"Content-Type": "application/json", "Accept": "application/json"}) as client:
        for company in companies:
            await asyncio.sleep(0.2)
            subdomain = company.get("subdomain", "")
            version = company.get("wd_version", 1)
            site = (company.get("site") or "careers").strip("/") or "careers"
            company_name = company.get("company", subdomain)
            url = (
                f"https://{subdomain}.wd{version}.myworkdayjobs.com"
                f"/wday/cxs/{subdomain}/{site}/jobs"
            )
            body = {
                "appliedFacets": {},
                "limit": 20,
                "offset": 0,
                "searchText": "intern",
            }
            try:
                resp = await client.post(url, json=body)
                if resp.status_code != 200:
                    continue
                data = resp.json()
            except Exception as e:
                logger.error("Workday error for %s: %s", company_name, e)
                continue

            postings = data.get("jobPostings") or []
            if not postings:
                continue

            for posting in postings:
                external_path = posting.get("externalPath") or ""
                if external_path.startswith("/"):
                    job_url = f"https://{subdomain}.wd{version}.myworkdayjobs.com{external_path}"
                else:
                    job_url = (
                        f"https://{subdomain}.wd{version}.myworkdayjobs.com"
                        f"/{site}/{external_path.lstrip('/')}"
                    )
                location = posting.get("locationsText") or ""
                remote_type = posting.get("remoteType") or ""
                description = (posting.get("jobDescription") or "")[:2000]
                results.append({
                    "title": posting.get("title") or "",
                    "company": company_name,
                    "location": location,
                    "remote": "remote" in remote_type.lower(),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": job_url,
                    "source": "workday",
                    "portal": "workday",
                    "posted_at": _posted_at_iso(posting.get("postedOn")),
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company_name, description),
                })

            logger.info("Workday %s: %d internships found", company_name, len(postings))

    logger.info("Workday: fetched %d listings", len(results))
    return results


# ── SmartRecruiters ───────────────────────────────────────────────────────────

async def fetch_smartrecruiters_jobs() -> list[dict]:
    path = DATA_DIR / "smartrecruiters_companies.json"
    if not path.exists():
        logger.warning("SmartRecruiters company list missing; skipping")
        return []
    slugs: list[str] = await run_in_threadpool(_load_json, path)
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for slug in slugs:
            await asyncio.sleep(0.25)
            offset = 0
            company_name = slug.replace("-", " ").title()
            while True:
                url = f"https://api.smartrecruiters.com/v1/companies/{slug}/postings"
                try:
                    resp = await client.get(
                        url, params={"limit": 100, "offset": offset}
                    )
                    if resp.status_code == 404:
                        break
                    resp.raise_for_status()
                    data = resp.json()
                except Exception as e:
                    logger.error("SmartRecruiters error for %s: %s", slug, e)
                    break

                content = data.get("content") or []
                if not content:
                    break

                for job in content:
                    title = job.get("name") or ""
                    loc = job.get("location") or {}
                    location = (
                        loc.get("fullLocation")
                        or ", ".join(
                            p
                            for p in [
                                loc.get("city"),
                                loc.get("region"),
                                loc.get("country"),
                            ]
                            if p
                        )
                        or ""
                    )
                    remote = bool(loc.get("remote"))
                    job_id = job.get("id") or job.get("uuid") or ""
                    posting_url = (
                        f"https://jobs.smartrecruiters.com/{slug}/{job_id}"
                        if job_id
                        else ""
                    )
                    company_obj = job.get("company") or {}
                    if isinstance(company_obj, dict) and company_obj.get("name"):
                        company_name = company_obj["name"]
                    results.append({
                        "title": title,
                        "company": company_name,
                        "location": location,
                        "remote": remote,
                        "description": "",
                        "skills_required": [],
                        "url": posting_url,
                        "source": "smartrecruiters",
                        "portal": "smartrecruiters",
                        "posted_at": _posted_at_iso(job.get("releasedDate")),
                        "expires_at": get_expires_at(),
                        "visa_sponsorship": get_visa_status(company_name, ""),
                    })

                total = data.get("totalFound") or 0
                offset += len(content)
                if offset >= total or len(content) < 100:
                    break

    logger.info("SmartRecruiters: fetched %d listings", len(results))
    return results


# ── Workable ──────────────────────────────────────────────────────────────────

async def fetch_workable_jobs() -> list[dict]:
    path = DATA_DIR / "workable_companies.json"
    if not path.exists():
        logger.warning("Workable company list missing; skipping")
        return []
    slugs: list[str] = await run_in_threadpool(_load_json, path)
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for slug in slugs:
            await asyncio.sleep(0.2)
            url = f"https://apply.workable.com/api/v1/widget/accounts/{slug}"
            try:
                resp = await client.get(url)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.error("Workable error for %s: %s", slug, e)
                continue

            company = data.get("name") or slug.replace("-", " ").title()
            for job in data.get("jobs") or []:
                city = job.get("city") or ""
                state = job.get("state") or ""
                country = job.get("country") or ""
                location = ", ".join(p for p in [city, state, country] if p)
                results.append({
                    "title": job.get("title") or "",
                    "company": company,
                    "location": location,
                    "remote": bool(job.get("telecommuting")),
                    "description": "",
                    "skills_required": [],
                    "url": job.get("url") or job.get("shortlink") or job.get("application_url") or "",
                    "source": "workable",
                    "portal": "workable",
                    "posted_at": _posted_at_iso(
                        job.get("published_on") or job.get("created_at")
                    ),
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company, ""),
                })

    logger.info("Workable: fetched %d listings", len(results))
    return results


# ── Recruitee ─────────────────────────────────────────────────────────────────

async def fetch_recruitee_jobs() -> list[dict]:
    path = DATA_DIR / "recruitee_companies.json"
    if not path.exists():
        logger.warning("Recruitee company list missing; skipping")
        return []
    slugs: list[str] = await run_in_threadpool(_load_json, path)
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for slug in slugs:
            await asyncio.sleep(0.2)
            url = f"https://{slug}.recruitee.com/api/offers/"
            try:
                resp = await client.get(url)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.error("Recruitee error for %s: %s", slug, e)
                continue

            company = slug.replace("-", " ").title()
            for offer in data.get("offers") or []:
                status = offer.get("status")
                if status and status != "published":
                    continue
                city = offer.get("city") or ""
                country = offer.get("country_code") or offer.get("country") or ""
                location = ", ".join(p for p in [city, country] if p)
                description = _strip_html(offer.get("description") or "")
                results.append({
                    "title": offer.get("title") or "",
                    "company": company,
                    "location": location,
                    "remote": bool(offer.get("remote") or offer.get("on_site") is False),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": offer.get("careers_url") or offer.get("url") or "",
                    "source": "recruitee",
                    "portal": "recruitee",
                    "posted_at": _posted_at_iso(offer.get("published_at") or offer.get("created_at")),
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company, description),
                })

    logger.info("Recruitee: fetched %d listings", len(results))
    return results


# ── BambooHR ──────────────────────────────────────────────────────────────────

async def fetch_bamboohr_jobs() -> list[dict]:
    path = DATA_DIR / "bamboohr_companies.json"
    if not path.exists():
        logger.warning("BambooHR company list missing; skipping")
        return []
    slugs: list[str] = await run_in_threadpool(_load_json, path)
    results: list[dict] = []

    async with httpx.AsyncClient(
        timeout=30, headers={"Accept": "application/json"}
    ) as client:
        for slug in slugs:
            await asyncio.sleep(0.2)
            url = f"https://{slug}.bamboohr.com/careers/list"
            try:
                resp = await client.get(url)
                if resp.status_code == 404:
                    continue
                if "application/json" not in (resp.headers.get("content-type") or ""):
                    continue
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.error("BambooHR error for %s: %s", slug, e)
                continue

            company = slug.replace("-", " ").title()
            for job in data.get("result") or []:
                title = job.get("jobOpeningName") or ""
                loc = job.get("location") or {}
                if isinstance(loc, dict):
                    location = ", ".join(
                        p for p in [loc.get("city"), loc.get("state")] if p
                    )
                else:
                    location = str(loc or "")
                job_id = job.get("id")
                job_url = (
                    f"https://{slug}.bamboohr.com/careers/{job_id}"
                    if job_id
                    else ""
                )
                description = ""
                posted_at = datetime.now(tz=timezone.utc).isoformat()
                # Fetch description only for likely intern/co-op titles (list
                # endpoint has no body — saves crawl time on permanent FT roles).
                if job_id and _has_internship_signal(title):
                    try:
                        detail = await client.get(
                            f"https://{slug}.bamboohr.com/careers/{job_id}/detail"
                        )
                        if detail.status_code == 200:
                            jo = (detail.json().get("result") or {}).get("jobOpening") or {}
                            description = _strip_html(jo.get("description") or "")
                            posted_at = _posted_at_iso(jo.get("datePosted"))
                            share = jo.get("jobOpeningShareUrl")
                            if share:
                                job_url = share
                    except Exception:
                        pass

                results.append({
                    "title": title,
                    "company": company,
                    "location": location,
                    "remote": bool(job.get("isRemote")),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": job_url,
                    "source": "bamboohr",
                    "portal": "bamboohr",
                    "posted_at": posted_at,
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company, description),
                })

    logger.info("BambooHR: fetched %d listings", len(results))
    return results


# ── Teamtailor ────────────────────────────────────────────────────────────────

async def fetch_teamtailor_jobs() -> list[dict]:
    path = DATA_DIR / "teamtailor_companies.json"
    if not path.exists():
        logger.warning("Teamtailor company list missing; skipping")
        return []
    slugs: list[str] = await run_in_threadpool(_load_json, path)
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for slug in slugs:
            await asyncio.sleep(0.2)
            url = f"https://{slug}.teamtailor.com/jobs.json"
            try:
                resp = await client.get(url)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.error("Teamtailor error for %s: %s", slug, e)
                continue

            company = (
                (data.get("title") or slug.replace("-", " ").title())
                .replace(" Jobs", "")
                .strip()
            )
            for item in data.get("items") or []:
                description = _strip_html(item.get("content_html") or item.get("content_text") or "")
                results.append({
                    "title": item.get("title") or "",
                    "company": company,
                    "location": "",
                    "remote": is_remote(description[:200]),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": item.get("url") or "",
                    "source": "teamtailor",
                    "portal": "teamtailor",
                    "posted_at": _posted_at_iso(item.get("date_published")),
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company, description),
                })

    logger.info("Teamtailor: fetched %d listings", len(results))
    return results


# ── iCIMS ─────────────────────────────────────────────────────────────────────

_ICIMS_JOB_LOC_RE = re.compile(
    r"https://careers-([^/]+)\.icims\.com/jobs/(\d+)/([^/]+)/job",
    re.I,
)


def _title_from_icims_slug(slug: str) -> str:
    from urllib.parse import unquote

    cleaned = unquote(slug or "").replace("-", " ").strip()
    return cleaned.title() if cleaned else "Job Opening"


async def fetch_icims_jobs() -> list[dict]:
    """Discover openings from public iCIMS career-site sitemaps (title from URL slug)."""
    path = DATA_DIR / "icims_companies.json"
    if not path.exists():
        logger.warning("iCIMS company list missing; skipping")
        return []
    slugs: list[str] = await run_in_threadpool(_load_json, path)
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for slug in slugs:
            await asyncio.sleep(0.25)
            sitemap_url = f"https://careers-{slug}.icims.com/sitemap.xml"
            try:
                resp = await client.get(sitemap_url)
                if resp.status_code != 200:
                    continue
                text = resp.text
            except Exception as e:
                logger.error("iCIMS error for %s: %s", slug, e)
                continue

            company = slug.replace("-", " ").title()
            seen_urls: set[str] = set()
            for m in _ICIMS_JOB_LOC_RE.finditer(text):
                job_url = m.group(0)
                if job_url in seen_urls:
                    continue
                seen_urls.add(job_url)
                title = _title_from_icims_slug(m.group(3))
                results.append({
                    "title": title,
                    "company": company,
                    "location": "",
                    "remote": is_remote(title),
                    "description": "",
                    "skills_required": [],
                    "url": job_url,
                    "source": "icims",
                    "portal": "icims",
                    "posted_at": datetime.now(tz=timezone.utc).isoformat(),
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": "unknown",
                })

    logger.info("iCIMS: fetched %d listings", len(results))
    return results


# ── Aggregate ─────────────────────────────────────────────────────────────────

async def fetch_all_jobs() -> list[dict]:
    raw_results = await asyncio.gather(
        fetch_adzuna_jobs(),
        fetch_greenhouse_jobs(),
        fetch_lever_jobs(),
        fetch_ashby_jobs(),
        fetch_jsearch_jobs(),
        fetch_muse_jobs(),
        fetch_usajobs_jobs(),
        fetch_workday_jobs(),
        fetch_smartrecruiters_jobs(),
        fetch_workable_jobs(),
        fetch_recruitee_jobs(),
        fetch_bamboohr_jobs(),
        fetch_teamtailor_jobs(),
        fetch_icims_jobs(),
        return_exceptions=True,
    )

    source_names = [
        "adzuna",
        "greenhouse",
        "lever",
        "ashby",
        "jsearch",
        "muse",
        "usajobs",
        "workday",
        "smartrecruiters",
        "workable",
        "recruitee",
        "bamboohr",
        "teamtailor",
        "icims",
    ]
    all_jobs: list[dict] = []

    for name, batch in zip(source_names, raw_results):
        if isinstance(batch, Exception):
            logger.error("%s source failed: %s", name, batch)
            batch = []
        raw_count = len(batch)
        filtered = filter_internships(batch)
        logger.info("%s: fetched %d → %d after filter", name.capitalize(), raw_count, len(filtered))
        all_jobs.extend(filtered)

    seen: set[str] = set()
    deduped: list[dict] = []
    for job in all_jobs:
        url = job.get("url", "")
        # Guard timestamptz upsert — Workday (and any other source) may emit
        # relative strings like "Posted 13 Days Ago".
        job["posted_at"] = _posted_at_iso(job.get("posted_at"))
        if url and url not in seen:
            seen.add(url)
            deduped.append(job)
        elif not url:
            deduped.append(job)

    logger.info("Total after all sources and filter: %d", len(deduped))
    return deduped
