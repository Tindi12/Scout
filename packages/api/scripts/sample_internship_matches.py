"""
Limited dry sample of internship/co-op filter matches across ATS sources.

Fetches a subset of boards (not the full crawl), applies filter_internships(),
and prints 15–20 example matches for the Part 3 checkpoint.

Usage (from packages/api):
    uv run python scripts/sample_internship_matches.py
    uv run python scripts/sample_internship_matches.py --per-ats 40 --limit 20
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
load_dotenv()

from services.job_fetcher import (  # noqa: E402
    DATA_DIR,
    _load_json,
    _strip_html,
    extract_skills,
    fetch_adzuna_jobs,
    filter_internships,
    get_expires_at,
    get_visa_status,
    internship_keep_reason,
    is_remote,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("sample_internship_matches")


async def _sample_greenhouse(client: httpx.AsyncClient, slugs: list[str]) -> list[dict]:
    out = []
    for slug in slugs:
        url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
        try:
            resp = await client.get(url, params={"content": "true"}, timeout=20)
            if resp.status_code != 200:
                continue
            company = slug.replace("-", " ").title()
            for job in resp.json().get("jobs") or []:
                description = _strip_html(job.get("content") or "")
                location = (job.get("location") or {}).get("name") or ""
                out.append({
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
        except Exception as e:
            logger.debug("greenhouse %s: %s", slug, e)
        await asyncio.sleep(0.15)
    return out


async def _sample_lever(client: httpx.AsyncClient, slugs: list[str]) -> list[dict]:
    out = []
    for slug in slugs:
        url = f"https://api.lever.co/v0/postings/{slug}"
        try:
            resp = await client.get(url, params={"mode": "json"}, timeout=20)
            if resp.status_code != 200:
                continue
            company = slug.replace("-", " ").title()
            payload = resp.json()
            for posting in payload if isinstance(payload, list) else []:
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
                out.append({
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
        except Exception as e:
            logger.debug("lever %s: %s", slug, e)
        await asyncio.sleep(0.1)
    return out


async def _sample_ashby(client: httpx.AsyncClient, slugs: list[str]) -> list[dict]:
    out = []
    for slug in slugs:
        url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
        try:
            resp = await client.get(url, timeout=20)
            if resp.status_code != 200:
                continue
            company = slug.replace("-", " ").title()
            for job in resp.json().get("jobs") or []:
                if not job.get("isListed", True):
                    continue
                description = _strip_html(job.get("descriptionHtml") or "")
                location = job.get("location") or ""
                out.append({
                    "title": job.get("title") or "",
                    "company": company,
                    "location": location,
                    "remote": is_remote(location),
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": job.get("jobUrl") or "",
                    "source": "ashby",
                    "portal": "ashby",
                    "posted_at": job.get("publishedAt")
                    or datetime.now(tz=timezone.utc).isoformat(),
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company, description),
                })
        except Exception as e:
            logger.debug("ashby %s: %s", slug, e)
        await asyncio.sleep(0.2)
    return out


async def _sample_workday(client: httpx.AsyncClient, companies: list[dict]) -> list[dict]:
    out = []
    for company in companies:
        subdomain = company.get("subdomain", "")
        version = company.get("wd_version", 1)
        site = (company.get("site") or "careers").strip("/") or "careers"
        company_name = company.get("company", subdomain)
        url = (
            f"https://{subdomain}.wd{version}.myworkdayjobs.com"
            f"/wday/cxs/{subdomain}/{site}/jobs"
        )
        body = {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": "intern"}
        try:
            resp = await client.post(
                url,
                json=body,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                timeout=20,
            )
            if resp.status_code != 200:
                continue
            for posting in resp.json().get("jobPostings") or []:
                external_path = posting.get("externalPath") or ""
                job_url = f"https://{subdomain}.wd{version}.myworkdayjobs.com{external_path}"
                location = posting.get("locationsText") or ""
                description = (posting.get("jobDescription") or "")[:2000]
                out.append({
                    "title": posting.get("title") or "",
                    "company": company_name,
                    "location": location,
                    "remote": False,
                    "description": description,
                    "skills_required": extract_skills(description),
                    "url": job_url,
                    "source": "workday",
                    "portal": "workday",
                    "posted_at": posting.get("postedOn")
                    or datetime.now(tz=timezone.utc).isoformat(),
                    "expires_at": get_expires_at(),
                    "visa_sponsorship": get_visa_status(company_name, description),
                })
        except Exception as e:
            logger.debug("workday %s: %s", company_name, e)
        await asyncio.sleep(0.15)
    return out


def _pick_diverse(slugs: list[str], n: int) -> list[str]:
    if len(slugs) <= n:
        return list(slugs)
    # Spread across the list so we don't only hit "a*" companies
    step = max(1, len(slugs) // n)
    picked = [slugs[i * step] for i in range(n)]
    # Prefer known high-signal boards if present
    boost = [
        "anthropic", "stripe", "databricks", "nvidia", "openai", "figma",
        "notion", "cloudflare", "doordash", "robinhood", "andurilindustries",
        "palantir", "scaleai", "airbnb", "discord",
    ]
    for b in boost:
        for s in slugs:
            if s.lower() == b.lower() and s not in picked:
                picked[0] = s
                break
    # Dedupe preserve order
    seen = set()
    out = []
    for s in picked:
        if s.lower() in seen:
            continue
        seen.add(s.lower())
        out.append(s)
    return out[:n]


async def main(per_ats: int, limit: int) -> None:
    gh = _load_json(DATA_DIR / "greenhouse_companies.json")
    lv = _load_json(DATA_DIR / "lever_companies.json")
    ash = _load_json(DATA_DIR / "ashby_companies.json")
    wd = _load_json(DATA_DIR / "workday_companies.json")

    counts = {
        "greenhouse": len(gh),
        "lever": len(lv),
        "ashby": len(ash),
        "workday": len(wd),
    }
    print("=== SLUG COUNTS ===")
    print(json.dumps(counts, indent=2))

    gh_sample = _pick_diverse(gh, per_ats)
    lv_sample = _pick_diverse(lv, per_ats)
    ash_sample = _pick_diverse(ash, per_ats)
    # Prefer workday tenants that look campus-oriented
    wd_sorted = sorted(
        wd,
        key=lambda e: (
            0 if any(x in (e.get("site") or "").lower() for x in ("campus", "intern", "university")) else 1,
            e.get("subdomain", ""),
        ),
    )
    wd_sample = wd_sorted[:per_ats]

    async with httpx.AsyncClient(timeout=30) as client:
        batches = await asyncio.gather(
            _sample_greenhouse(client, gh_sample),
            _sample_lever(client, lv_sample),
            _sample_ashby(client, ash_sample),
            _sample_workday(client, wd_sample),
            fetch_adzuna_jobs(),
            return_exceptions=True,
        )

    raw: list[dict] = []
    names = ["greenhouse", "lever", "ashby", "workday", "adzuna"]
    for name, batch in zip(names, batches):
        if isinstance(batch, Exception):
            logger.error("%s sample failed: %s", name, batch)
            continue
        logger.info("%s raw listings: %d", name, len(batch))
        raw.extend(batch)

    matched = filter_internships(raw)
    # Diversify by source for the printed sample
    by_source: dict[str, list] = {}
    for job in matched:
        reason = internship_keep_reason(job) or "?"
        job = {**job, "_keep_reason": reason}
        by_source.setdefault(job.get("source") or "?", []).append(job)

    sample: list[dict] = []
    sources = list(by_source.keys())
    i = 0
    while len(sample) < limit and any(by_source.values()):
        src = sources[i % len(sources)]
        i += 1
        if by_source.get(src):
            sample.append(by_source[src].pop(0))
        else:
            sources = [s for s in sources if by_source.get(s)]

    print(f"\n=== FILTER MATCHES (showing {len(sample)} of {len(matched)} from sample crawl) ===\n")
    for idx, job in enumerate(sample, 1):
        print(
            f"{idx:2d}. [{job.get('source')}] {job.get('company')} — {job.get('title')}\n"
            f"    reason={job.get('_keep_reason')}  posted_at={job.get('posted_at')}\n"
            f"    {job.get('url')}\n"
        )


if __name__ == "__main__":
    # Avoid Windows cp1252 crashes on fancy title punctuation.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-ats", type=int, default=35)
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    asyncio.run(main(per_ats=args.per_ats, limit=args.limit))
