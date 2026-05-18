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

KEEP_KEYWORDS = [
    "intern", "internship", "co-op", "coop",
    "student", "entry level", "new grad", "junior",
    "apprentice", "trainee", "graduate program",
    "rotational", "early career", "campus",
    "undergraduate", "phd intern", "research assistant",
    "teaching assistant", "summer", "seasonal",
    "graduate intern", "student worker",
]

EXCLUDE_KEYWORDS = [
    "senior", "staff", "principal", "director",
    "manager", "lead", "head of", "vp ",
    "vice president", "chief", "architect",
    "consultant", "partner", "associate director",
    "sr.", "sr ", " ii ", " iii ", " iv ",
    "distinguished", "fellow", "executive",
]

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


def extract_skills(description: str) -> list[str]:
    desc_lower = description.lower()
    return [skill for skill in COMMON_SKILLS if skill.lower() in desc_lower]


def get_visa_status(company: str, description: str) -> str:
    desc_lower = description.lower()
    for phrase in NO_SPONSORSHIP_PHRASES:
        if phrase in desc_lower:
            return "no"

    try:
        with open(DATA_DIR / "visa_sponsorship.json") as f:
            visa_data = json.load(f)

        company_lower = company.lower()
        for slug in visa_data.get("cpt_opt_friendly", []):
            if slug in company_lower or company_lower.startswith(slug):
                return "yes"
        for slug in visa_data.get("no_sponsorship", []):
            if slug in company_lower or company_lower.startswith(slug):
                return "no"
    except Exception as e:
        logger.warning("Could not load visa_sponsorship.json: %s", e)

    return "unknown"


def get_expires_at() -> str:
    return (datetime.now(tz=timezone.utc) + timedelta(days=14)).isoformat()


def is_remote(location: str) -> bool:
    loc = location.lower()
    return "remote" in loc or "anywhere" in loc


def filter_internships(listings: list[dict]) -> list[dict]:
    results = []
    for listing in listings:
        title = listing.get("title", "").lower()
        has_keep = any(k in title for k in KEEP_KEYWORDS)
        has_exclude = any(e in title for e in EXCLUDE_KEYWORDS)
        if has_keep and not has_exclude:
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
        description = _strip_html(listing.get("description", ""))
        company = listing.get("company", {}).get("display_name", "")
        location = listing.get("location", {}).get("display_name", "")
        results.append({
            "title": listing.get("title", ""),
            "company": company,
            "location": location,
            "remote": is_remote(location),
            "description": description,
            "skills_required": extract_skills(description),
            "url": listing.get("redirect_url", ""),
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
                description = _strip_html(job.get("content", ""))
                location = job.get("location", {}).get("name", "")
                results.append({
                    "title": job.get("title", ""),
                    "company": company,
                    "location": location,
                    "remote": is_remote(location),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": job.get("absolute_url", ""),
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
                categories = posting.get("categories", {})
                location = categories.get("location", "")
                created_ms = posting.get("createdAt", 0)
                try:
                    posted_at = datetime.fromtimestamp(
                        created_ms / 1000, tz=timezone.utc
                    ).isoformat()
                except Exception:
                    posted_at = datetime.now(tz=timezone.utc).isoformat()

                description = posting.get("descriptionPlain", "")
                results.append({
                    "title": posting.get("text", ""),
                    "company": company,
                    "location": location,
                    "remote": is_remote(location),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": posting.get("hostedUrl", ""),
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
    ashby_path = DATA_DIR / "ashby_companies.json"
    slugs: list[str] = await run_in_threadpool(_load_json, ashby_path)
    results = []

    async with httpx.AsyncClient(timeout=30) as client:
        for slug in slugs:
            await asyncio.sleep(0.3)
            url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
            try:
                resp = await client.get(url)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError:
                continue
            except Exception as e:
                logger.error("Ashby error for %s: %s", slug, e)
                continue

            company = slug.replace("-", " ").title()
            for job in data.get("jobs", []):
                location = job.get("location") or "Not specified"
                description = _strip_html(job.get("descriptionHtml", ""))
                results.append({
                    "title": job.get("title", ""),
                    "company": company,
                    "location": location,
                    "remote": job.get("isRemote", False),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": job.get("jobUrl", ""),
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
        company = job.get("employer_name", "")
        results.append({
            "title": job.get("job_title", ""),
            "company": company,
            "location": location,
            "remote": job.get("job_is_remote", False),
            "description": description,
            "skills_required": job.get("job_required_skills") or [],
            "url": job.get("job_apply_link", ""),
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
        "category": "Internship",
        "page": page,
        "level": "Internship",
    }
    try:
        resp = await client.get(url, params=params)
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
        company = job.get("company", {}).get("name", "")
        results.append({
            "title": job.get("name", ""),
            "company": company,
            "location": location,
            "remote": "remote" in location.lower(),
            "description": description,
            "skills_required": extract_skills(description),
            "url": job.get("refs", {}).get("landing_page", ""),
            "source": "muse",
            "portal": "unknown",
            "posted_at": job.get("publication_date", datetime.now(tz=timezone.utc).isoformat()),
            "expires_at": get_expires_at(),
            "visa_sponsorship": get_visa_status(company, description),
        })
    return results


async def fetch_muse_jobs() -> list[dict]:
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
        "User-Agent": "tindibrown12@gmail.com",
    }
    params = {
        "Keyword": keyword,
        "ResultsPerPage": 50,
        "PositionOfferingTypeCode": 15328,
    }
    try:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("USAJobs query '%s' failed: %s", keyword, e)
        return []

    results = []
    items = data.get("SearchResult", {}).get("SearchResultItems", [])
    for item in items:
        desc = item.get("MatchedObjectDescriptor", {})
        apply_uris = desc.get("ApplyURI", [])
        description = desc.get("UserArea", {}).get("Details", {}).get("JobSummary", "")
        results.append({
            "title": desc.get("PositionTitle", ""),
            "company": desc.get("OrganizationName", ""),
            "location": desc.get("PositionLocationDisplay", ""),
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
        return_exceptions=True,
    )

    source_names = ["adzuna", "greenhouse", "lever", "ashby", "jsearch", "muse", "usajobs"]
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
        if url and url not in seen:
            seen.add(url)
            deduped.append(job)
        elif not url:
            deduped.append(job)

    logger.info("Total after all sources and filter: %d", len(deduped))
    return deduped
