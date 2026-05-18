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

INTERNSHIP_KEYWORDS = [
    "intern", "internship", "co-op", "coop", "student",
    "entry level", "new grad", "junior",
]


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
    return [
        job for job in listings
        if any(kw in job.get("title", "").lower() for kw in INTERNSHIP_KEYWORDS)
    ]


async def fetch_adzuna_jobs() -> list[dict]:
    url = "https://api.adzuna.com/v1/api/jobs/us/search/1"
    params = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_APP_KEY,
        "what": "intern",
        "results_per_page": 50,
    }

    async with httpx.AsyncClient(timeout=30, headers={"Accept": "application/json"}) as client:
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error("Adzuna fetch failed: %s", e)
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

    results = filter_internships(results)
    logger.info("Adzuna: fetched %d internship listings", len(results))
    return results


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


async def fetch_all_jobs() -> list[dict]:
    adzuna, greenhouse, lever = await asyncio.gather(
        fetch_adzuna_jobs(),
        fetch_greenhouse_jobs(),
        fetch_lever_jobs(),
    )

    all_jobs = adzuna + greenhouse + lever

    seen: set[str] = set()
    deduped: list[dict] = []
    for job in all_jobs:
        url = job.get("url", "")
        if url and url not in seen:
            seen.add(url)
            deduped.append(job)
        elif not url:
            deduped.append(job)

    logger.info(
        "fetch_all_jobs: %d total after dedup (adzuna=%d, greenhouse=%d, lever=%d)",
        len(deduped), len(adzuna), len(greenhouse), len(lever),
    )
    return deduped
