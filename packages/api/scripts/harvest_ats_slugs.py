"""
Discover, validate, and merge ATS board slugs into packages/api/data/*_companies.json.

Sources (public):
  - Existing Scout JSON lists + orphan data/_harvested_slugs.json
  - Feashliaa/job-board-aggregator company dumps (Greenhouse/Lever/Ashby/Workday)
  - andrewpalet/hire-signal config/companies.json
  - Curated intern-likely company name → slug variants
  - SimplifyJobs internship READMEs (board URL scrape when available)

Only NEW candidates are validated. Live boards (HTTP 200 on the same public APIs
the fetcher uses) are merged, deduped, and written back.

Usage (from packages/api):
    uv run python scripts/harvest_ats_slugs.py
    uv run python scripts/harvest_ats_slugs.py --dry-run
    uv run python scripts/harvest_ats_slugs.py --concurrency 40
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("harvest_ats_slugs")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

PUBLIC_LISTS = {
    "greenhouse": (
        "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/"
        "data/greenhouse_companies.json"
    ),
    "lever": (
        "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/"
        "data/lever_companies.json"
    ),
    "ashby": (
        "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/"
        "data/ashby_companies.json"
    ),
    "workday": (
        "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/"
        "data/workday_companies.json"
    ),
    "bamboohr": (
        "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/"
        "data/bamboohr_companies.json"
    ),
    "icims": (
        "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/"
        "data/icims_companies.json"
    ),
}

OPENJOBS_URL = (
    "https://raw.githubusercontent.com/outscal/OpenJobs/main/data/companies_v2.json"
)

HIRE_SIGNAL_URL = (
    "https://raw.githubusercontent.com/andrewpalet/hire-signal/main/config/companies.json"
)

SIMPLIFY_READMES = [
    "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/README.md",
    "https://raw.githubusercontent.com/SimplifyJobs/Summer2025-Internships/dev/README.md",
    "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md",
]

# Companies strongly associated with university / internship recruiting.
# Used to generate slug variants and to prioritize keep-even-if-empty boards.
INTERN_LIKELY_NAMES = [
    "google", "meta", "facebook", "apple", "amazon", "microsoft", "netflix", "nvidia",
    "adobe", "salesforce", "oracle", "ibm", "intel", "amd", "qualcomm", "broadcom",
    "cisco", "vmware", "servicenow", "snowflake", "databricks", "palantir", "stripe",
    "square", "block", "coinbase", "robinhood", "affirm", "plaid", "chime", "brex",
    "ramp", "mercury", "doordash", "uber", "lyft", "airbnb", "booking", "expedia",
    "spotify", "discord", "slack", "zoom", "dropbox", "box", "notion", "figma",
    "canva", "atlassian", "twilio", "okta", "cloudflare", "datadog", "elastic",
    "hashicorp", "gitlab", "github", "openai", "anthropic", "scaleai", "scale",
    "anduril", "lockheed", "northrop", "raytheon", "boeing", "spacex", "blueorigin",
    "tesla", "rivian", "gm", "ford", "toyota", "honda", "nike", "disney", " warner",
    "comcast", "verizon", "att", "t-mobile", "jpmorgan", "chase", "goldman",
    "morganstanley", "citi", "bankofamerica", "capitalone", "wells", "fidelity",
    "vanguard", "blackrock", "bloomberg", "two sigma", "twosigma", "jane street",
    "janestreet", "citadel", "hrt", "hudsonriver", "jump", "optiver", "imc",
    "akuna", "sig", "drw", "tower", "deshaw", "renaissance", "pepsi", "coca-cola",
    "p&g", "unilever", "johnson", "pfizer", "moderna", "genentech", "gilead",
    "thermo fisher", "illumina", "intuit", "workday", "sap", "autodesk", "ansys",
    "cadence", "synopsys", "siemens", "ge", "honeywell", "3m", "caterpillar",
    "john deere", "schlumberger", "exxon", "chevron", "shell", "bp", "dupont",
    "dow", "bayer", "BASF", "micron", "ti", "texasinstruments", "analog", "nuro",
    "waymo", "cruise", "zoox", "aurora", "appliedintuition", "duolingo", "reddit",
    "pinterest", "snap", "tiktok", "bytedance", "linkedin", "indeed", "shopify",
    "etsy", "ebay", "walmart", "target", "costco", "home depot", "lowes",
    "deloitte", "ey", "pwc", "kpmg", "mckinsey", "bain", "bcg", "accenture",
    "capgemini", "cognizant", "infosys", "wipro", "tcs", "slalom", "thoughtworks",
    "hubspot", "zendesk", "intercom", "segment", "amplitude", "mixpanel", "sentry",
    "vercel", "netlify", "cloudinary", "mongodb", "redis", "confluent", "kafka",
    "airtable", "asana", "monday", "coda", "miro", "lucide", "ripling", "rippling",
    "gusto", "deel", "remote", "lattice", "greenhouse", "lever", "ashby",
    "coursera", "udemy", "duolingo", "chegg", "khan", "roblox", "unity", "epicgames",
    "riot", "activision", "ea", "take-two", "sony", "nintendo", "paypal", "visa",
    "mastercard", "americanexpress", "amex", "discover", "sofi", "wealthfront",
    "betterment", "robinhood", "coursera", "duolingo",
]

BOARD_URL_RE = re.compile(
    r"https?://(?:"
    r"boards(?:-api)?\.greenhouse\.io/(?:embed/job_board\?for=)?([a-zA-Z0-9_-]+)"
    r"|api\.greenhouse\.io/v1/boards/([a-zA-Z0-9_-]+)"
    r"|jobs\.lever\.co/([a-zA-Z0-9_-]+)"
    r"|api\.lever\.co/v0/postings/([a-zA-Z0-9_-]+)"
    r"|jobs\.ashbyhq\.com/([a-zA-Z0-9_.-]+)"
    r"|api\.ashbyhq\.com/posting-api/job-board/([a-zA-Z0-9_.-]+)"
    r"|([a-zA-Z0-9-]+)\.wd(\d+)\.myworkdayjobs\.com(?:/(?:[a-zA-Z0-9_-]+))?/([^?\s)#]+)"
    r"|jobs\.smartrecruiters\.com/([a-zA-Z0-9_-]+)"
    r"|apply\.workable\.com/([a-zA-Z0-9_-]+)"
    r"|([a-zA-Z0-9-]+)\.recruitee\.com"
    r"|([a-zA-Z0-9-]+)\.bamboohr\.com"
    r"|([a-zA-Z0-9-]+)\.teamtailor\.com"
    r"|careers-([a-zA-Z0-9-]+)\.icims\.com"
    r")",
    re.I,
)

STRING_ATS = (
    "greenhouse",
    "lever",
    "ashby",
    "smartrecruiters",
    "workable",
    "recruitee",
    "bamboohr",
    "teamtailor",
    "icims",
)

INTERNSHIP_TITLE_RE = re.compile(r"\b(?:intern(?:ship|ships)?|co[\s-]?op)\b", re.I)


def _load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _slugify(name: str) -> list[str]:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    compact = re.sub(r"[^a-z0-9]+", "", name.lower())
    camel = "".join(p.capitalize() for p in re.split(r"[^a-z0-9]+", name.lower()) if p)
    out = {base, compact}
    if camel and camel.lower() != compact:
        out.add(camel)
    return [s for s in out if s and len(s) >= 2]


def _workday_key(entry: dict) -> str:
    return f"{entry['subdomain']}|wd{entry['wd_version']}|{entry.get('site', 'careers')}"


def _parse_workday_token(token: str) -> dict | None:
    """Feashliaa format: subdomain|wdN|site"""
    parts = token.split("|")
    if len(parts) != 3:
        return None
    subdomain, wd, site = parts
    m = re.fullmatch(r"wd(\d+)", wd.strip(), re.I)
    if not m or not subdomain.strip() or not site.strip():
        return None
    sub = subdomain.strip().lower()
    return {
        "company": sub.replace("-", " ").title(),
        "subdomain": sub,
        "wd_version": m.group(1),
        "site": site.strip().strip("/"),
    }


def _is_priority_slug(slug: str) -> bool:
    s = slug.lower().replace("_", "").replace("-", "").replace(".", "")
    for name in INTERN_LIKELY_NAMES:
        n = re.sub(r"[^a-z0-9]+", "", name.lower())
        if n and (n in s or s in n):
            return True
    return False


async def _fetch_json(client: httpx.AsyncClient, url: str):
    resp = await client.get(url, timeout=60, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()


async def _fetch_text(client: httpx.AsyncClient, url: str) -> str:
    resp = await client.get(url, timeout=60, follow_redirects=True)
    if resp.status_code != 200:
        return ""
    return resp.text


def _extract_board_urls(text: str) -> dict[str, set]:
    found = {ats: set() for ats in (*STRING_ATS, "workday")}
    for m in BOARD_URL_RE.finditer(text or ""):
        g = m.groups()
        if g[0]:
            found["greenhouse"].add(g[0])
        elif g[1]:
            found["greenhouse"].add(g[1])
        elif g[2]:
            found["lever"].add(g[2])
        elif g[3]:
            found["lever"].add(g[3])
        elif g[4]:
            found["ashby"].add(g[4])
        elif g[5]:
            found["ashby"].add(g[5])
        elif g[6] and g[7] and g[8]:
            site = g[8].strip("/").split("/")[0]
            if site:
                found["workday"].add(f"{g[6].lower()}|wd{g[7]}|{site}")
        elif g[9]:
            found["smartrecruiters"].add(g[9])
        elif g[10]:
            found["workable"].add(g[10])
        elif g[11]:
            found["recruitee"].add(g[11])
        elif g[12]:
            found["bamboohr"].add(g[12])
        elif g[13]:
            found["teamtailor"].add(g[13])
        elif g[14]:
            found["icims"].add(g[14])
    return found


def _load_string_list(name: str) -> set[str]:
    path = DATA_DIR / f"{name}_companies.json"
    if not path.exists():
        return set()
    raw = _load_json(path)
    return {s for s in raw if isinstance(s, str) and s.strip()}


async def _ingest_openjobs(client: httpx.AsyncClient, candidates: dict) -> None:
    try:
        logger.info("Fetching OpenJobs companies_v2.json")
        rows = await _fetch_json(client, OPENJOBS_URL)
    except Exception as e:
        logger.warning("OpenJobs fetch failed: %s", e)
        return
    pats = {
        "smartrecruiters": re.compile(r"(?:jobs\.)?smartrecruiters\.com/([^/?#]+)", re.I),
        "workable": re.compile(r"apply\.workable\.com/([^/?#]+)", re.I),
        "recruitee": re.compile(r"([a-z0-9-]+)\.recruitee\.com", re.I),
        "bamboohr": re.compile(r"([a-z0-9-]+)\.bamboohr\.com", re.I),
        "teamtailor": re.compile(r"([a-z0-9-]+)\.teamtailor\.com", re.I),
        "icims": re.compile(r"careers-([a-z0-9-]+)\.icims\.com", re.I),
    }
    skip = {"www", "jobs", "api", "app", "careers", "external", "job", "company", "apply"}
    for row in rows if isinstance(rows, list) else []:
        for url in row.get("ats_links") or []:
            if not isinstance(url, str):
                continue
            for ats, pat in pats.items():
                m = pat.search(url)
                if not m:
                    continue
                slug = m.group(1)
                if slug.lower() in skip:
                    continue
                candidates[ats].add(slug)
                candidates["priority"].add(f"{ats}:{slug}")


async def validate_smartrecruiters(client: httpx.AsyncClient, slug: str) -> tuple[bool, bool]:
    url = f"https://api.smartrecruiters.com/v1/companies/{slug}/postings"
    try:
        resp = await client.get(url, params={"limit": 100}, timeout=20)
        if resp.status_code != 200:
            return False, False
        jobs = resp.json().get("content") or []
        has_intern = any(INTERNSHIP_TITLE_RE.search(j.get("name") or "") for j in jobs)
        return True, has_intern
    except Exception:
        return False, False


async def validate_workable(client: httpx.AsyncClient, slug: str) -> tuple[bool, bool]:
    url = f"https://apply.workable.com/api/v1/widget/accounts/{slug}"
    try:
        resp = await client.get(url, timeout=20)
        if resp.status_code != 200:
            return False, False
        jobs = resp.json().get("jobs") or []
        has_intern = any(INTERNSHIP_TITLE_RE.search(j.get("title") or "") for j in jobs)
        return True, has_intern
    except Exception:
        return False, False


async def validate_recruitee(client: httpx.AsyncClient, slug: str) -> tuple[bool, bool]:
    url = f"https://{slug}.recruitee.com/api/offers/"
    try:
        resp = await client.get(url, timeout=20)
        if resp.status_code != 200:
            return False, False
        offers = resp.json().get("offers") or []
        has_intern = any(INTERNSHIP_TITLE_RE.search(o.get("title") or "") for o in offers)
        return True, has_intern
    except Exception:
        return False, False


async def validate_bamboohr(client: httpx.AsyncClient, slug: str) -> tuple[bool, bool]:
    url = f"https://{slug}.bamboohr.com/careers/list"
    try:
        resp = await client.get(url, headers={"Accept": "application/json"}, timeout=20)
        if resp.status_code != 200:
            return False, False
        if "application/json" not in (resp.headers.get("content-type") or ""):
            return False, False
        jobs = resp.json().get("result") or []
        has_intern = any(
            INTERNSHIP_TITLE_RE.search(j.get("jobOpeningName") or "") for j in jobs
        )
        return True, has_intern
    except Exception:
        return False, False


async def validate_teamtailor(client: httpx.AsyncClient, slug: str) -> tuple[bool, bool]:
    url = f"https://{slug}.teamtailor.com/jobs.json"
    try:
        resp = await client.get(url, timeout=20)
        if resp.status_code != 200:
            return False, False
        items = resp.json().get("items") or []
        has_intern = any(INTERNSHIP_TITLE_RE.search(i.get("title") or "") for i in items)
        return True, has_intern
    except Exception:
        return False, False


async def validate_icims(client: httpx.AsyncClient, slug: str) -> tuple[bool, bool]:
    url = f"https://careers-{slug}.icims.com/sitemap.xml"
    try:
        resp = await client.get(url, timeout=20)
        if resp.status_code != 200 or "<loc>" not in resp.text.lower():
            return False, False
        has_intern = bool(INTERNSHIP_TITLE_RE.search(resp.text))
        return True, has_intern
    except Exception:
        return False, False


async def collect_candidates(client: httpx.AsyncClient) -> dict:
    existing = {
        "greenhouse": _load_string_list("greenhouse"),
        "lever": _load_string_list("lever"),
        "ashby": _load_string_list("ashby"),
        "smartrecruiters": _load_string_list("smartrecruiters"),
        "workable": _load_string_list("workable"),
        "recruitee": _load_string_list("recruitee"),
        "bamboohr": _load_string_list("bamboohr"),
        "teamtailor": _load_string_list("teamtailor"),
        "icims": _load_string_list("icims"),
    }
    existing_wd_raw = _load_json(DATA_DIR / "workday_companies.json")
    existing_wd = {_workday_key(e): e for e in existing_wd_raw}

    candidates = {
        **{ats: set() for ats in STRING_ATS},
        "workday": {},  # key -> entry
        "priority": set(),  # "ats:slug" or workday keys
    }

    # Orphan harvested snapshot
    harvested_path = DATA_DIR / "_harvested_slugs.json"
    if harvested_path.exists():
        harvested = _load_json(harvested_path)
        for ats in ("greenhouse", "lever", "ashby"):
            for slug in harvested.get(ats, []):
                if isinstance(slug, str) and slug.strip():
                    candidates[ats].add(slug.strip())

    # Public aggregator dumps
    for ats, url in PUBLIC_LISTS.items():
        logger.info("Fetching public list: %s", ats)
        data = await _fetch_json(client, url)
        if ats == "workday":
            for token in data:
                entry = _parse_workday_token(token) if isinstance(token, str) else None
                if entry:
                    candidates["workday"][_workday_key(entry)] = entry
        else:
            for slug in data:
                if isinstance(slug, str) and slug.strip():
                    cleaned = slug.strip().lstrip("-") if ats == "icims" else slug.strip()
                    candidates[ats].add(cleaned)

    await _ingest_openjobs(client, candidates)

    # hire-signal curated tech boards (priority)
    try:
        logger.info("Fetching hire-signal companies.json")
        hs = await _fetch_json(client, HIRE_SIGNAL_URL)
        for row in hs if isinstance(hs, list) else []:
            source = (row.get("source") or "").lower()
            slug = row.get("id") or row.get("slug")
            if not slug or source not in ("greenhouse", "lever", "ashby"):
                continue
            candidates[source].add(str(slug).strip())
            candidates["priority"].add(f"{source}:{slug}")
            if _is_priority_slug(str(slug)):
                candidates["priority"].add(f"{source}:{slug}")
    except Exception as e:
        logger.warning("hire-signal fetch failed: %s", e)

    # SimplifyJobs READMEs
    for url in SIMPLIFY_READMES:
        try:
            text = await _fetch_text(client, url)
            if not text:
                continue
            found = _extract_board_urls(text)
            for ats in STRING_ATS:
                for slug in found[ats]:
                    candidates[ats].add(slug)
                    candidates["priority"].add(f"{ats}:{slug}")
            for token in found["workday"]:
                entry = _parse_workday_token(token)
                if entry:
                    key = _workday_key(entry)
                    candidates["workday"][key] = entry
                    candidates["priority"].add(f"workday:{key}")
            logger.info("Parsed Simplify README %s", url.split("/")[-2])
        except Exception as e:
            logger.warning("Simplify README %s failed: %s", url, e)

    # Name → slug variants for intern-likely companies
    for name in INTERN_LIKELY_NAMES:
        for slug in _slugify(name):
            for ats in ("greenhouse", "lever", "ashby", "smartrecruiters", "workable", "bamboohr"):
                candidates[ats].add(slug)
                candidates["priority"].add(f"{ats}:{slug}")
            for ver in ("1", "3", "5"):
                for site in ("careers", "External", "Campus", f"{slug}", f"{slug}_careers"):
                    entry = {
                        "company": name.title(),
                        "subdomain": slug,
                        "wd_version": ver,
                        "site": site,
                    }
                    key = _workday_key(entry)
                    candidates["workday"][key] = entry
                    candidates["priority"].add(f"workday:{key}")

    # Tag priority by name match
    for ats in STRING_ATS:
        for slug in list(candidates[ats]):
            if _is_priority_slug(slug):
                candidates["priority"].add(f"{ats}:{slug}")
    for key in list(candidates["workday"]):
        if _is_priority_slug(candidates["workday"][key]["subdomain"]):
            candidates["priority"].add(f"workday:{key}")

    new_string = {
        ats: sorted(candidates[ats] - existing[ats]) for ats in STRING_ATS
    }
    new_wd = {k: v for k, v in candidates["workday"].items() if k not in existing_wd}

    logger.info(
        "Candidates new — "
        + " ".join(f"{ats}={len(new_string[ats])}" for ats in STRING_ATS)
        + f" workday={len(new_wd)} (existing kept as-is)"
    )

    return {
        "existing": {**existing, "workday": existing_wd},
        "new": {**new_string, "workday": new_wd},
        "priority": candidates["priority"],
    }


async def validate_greenhouse(client: httpx.AsyncClient, slug: str) -> tuple[bool, bool]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    try:
        resp = await client.get(url, params={"content": "false"}, timeout=20)
        if resp.status_code != 200:
            return False, False
        jobs = resp.json().get("jobs") or []
        has_intern = any(INTERNSHIP_TITLE_RE.search(j.get("title") or "") for j in jobs)
        return True, has_intern
    except Exception:
        return False, False


async def validate_lever(client: httpx.AsyncClient, slug: str) -> tuple[bool, bool]:
    url = f"https://api.lever.co/v0/postings/{slug}"
    try:
        resp = await client.get(url, params={"mode": "json"}, timeout=20)
        if resp.status_code != 200:
            return False, False
        payload = resp.json()
        postings = payload if isinstance(payload, list) else []
        has_intern = any(INTERNSHIP_TITLE_RE.search(p.get("text") or "") for p in postings)
        return True, has_intern
    except Exception:
        return False, False


async def validate_ashby(client: httpx.AsyncClient, slug: str) -> tuple[bool, bool]:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    try:
        resp = await client.get(url, timeout=20)
        if resp.status_code != 200:
            return False, False
        jobs = resp.json().get("jobs") or []
        has_intern = any(INTERNSHIP_TITLE_RE.search(j.get("title") or "") for j in jobs)
        return True, has_intern
    except Exception:
        return False, False


async def validate_workday(client: httpx.AsyncClient, entry: dict) -> tuple[bool, bool]:
    subdomain = entry["subdomain"]
    version = entry["wd_version"]
    site = entry.get("site") or "careers"
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
            return False, False
        postings = resp.json().get("jobPostings") or []
        has_intern = any(INTERNSHIP_TITLE_RE.search(p.get("title") or "") for p in postings)
        return True, has_intern
    except Exception:
        return False, False


async def _validate_pool(
    label: str,
    items: list,
    validate_one,
    *,
    concurrency: int,
    priority: set,
    priority_prefix: str,
    require_intern_if_not_priority: bool,
) -> list:
    """validate_one(item) -> (live, has_intern). Returns accepted items."""
    sem = asyncio.Semaphore(concurrency)
    accepted: list = []
    live_n = intern_n = 0
    done = 0
    total = len(items)

    async def one(item):
        nonlocal live_n, intern_n, done
        async with sem:
            live, has_intern = await validate_one(item)
        done += 1
        if done % 200 == 0 or done == total:
            logger.info("%s validated %d/%d (accepted=%d)", label, done, total, len(accepted))
        if not live:
            return
        live_n += 1
        slug_key = item if isinstance(item, str) else _workday_key(item)
        is_pri = f"{priority_prefix}:{slug_key}" in priority or (
            isinstance(item, str) and _is_priority_slug(item)
        ) or (
            isinstance(item, dict) and _is_priority_slug(item.get("subdomain", ""))
        )
        if require_intern_if_not_priority and not is_pri and not has_intern:
            return
        if has_intern:
            intern_n += 1
        accepted.append(item)

    await asyncio.gather(*(one(i) for i in items))
    logger.info(
        "%s done: live=%d accepted=%d with_intern_titles=%d",
        label, live_n, len(accepted), intern_n,
    )
    return accepted


async def run(dry_run: bool, concurrency: int) -> dict:
    limits = httpx.Limits(max_connections=concurrency + 10, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(
        timeout=30,
        limits=limits,
        headers={"User-Agent": "ScoutInternshipHarvest/1.0"},
    ) as client:
        bag = await collect_candidates(client)
        priority = bag["priority"]

        # Prefer validating priority / intern-titled boards; drop empty non-priority.
        validators = {
            "greenhouse": validate_greenhouse,
            "lever": validate_lever,
            "ashby": validate_ashby,
            "smartrecruiters": validate_smartrecruiters,
            "workable": validate_workable,
            "recruitee": validate_recruitee,
            "bamboohr": validate_bamboohr,
            "teamtailor": validate_teamtailor,
            "icims": validate_icims,
        }
        accepted: dict[str, list] = {}
        for ats, validator in validators.items():
            items = bag["new"][ats]
            # Cap BambooHR / iCIMS new-candidate validation to keep harvest runtime sane
            if ats in ("bamboohr", "icims") and len(items) > 2500:
                pri = [s for s in items if f"{ats}:{s}" in priority or _is_priority_slug(s)]
                rest = [s for s in items if s not in pri]
                items = pri + rest[: max(0, 2500 - len(pri))]
                logger.info("%s validating capped set %d (of %d new)", ats, len(items), len(bag["new"][ats]))
            conc = max(5, concurrency // 2) if ats == "ashby" else concurrency
            accepted[ats] = await _validate_pool(
                ats,
                items,
                lambda s, c=client, v=validator: v(c, s),
                concurrency=conc,
                priority=priority,
                priority_prefix=ats,
                require_intern_if_not_priority=True,
            )

        # Workday: only validate priority + campus-ish sites to keep runtime sane,
        # plus a sample of Feashliaa entries whose site looks campus/intern related.
        wd_candidates = list(bag["new"]["workday"].values())
        campus_ish = []
        priority_wd = []
        for e in wd_candidates:
            key = _workday_key(e)
            site_l = (e.get("site") or "").lower()
            if f"workday:{key}" in priority or _is_priority_slug(e["subdomain"]):
                priority_wd.append(e)
            elif any(x in site_l for x in ("campus", "university", "intern", "student", "early")):
                campus_ish.append(e)

        # Cap non-priority campus set; priority always attempted.
        wd_to_check = priority_wd + campus_ish[:4000]
        # Dedup by key
        seen_wd = set()
        wd_deduped = []
        for e in wd_to_check:
            k = _workday_key(e)
            if k in seen_wd:
                continue
            seen_wd.add(k)
            wd_deduped.append(e)

        logger.info(
            "Workday validating %d tenants (priority=%d campusish=%d)",
            len(wd_deduped), len(priority_wd), min(len(campus_ish), 4000),
        )
        wd_ok = await _validate_pool(
            "workday",
            wd_deduped,
            lambda e, c=client: validate_workday(c, e),
            concurrency=concurrency,
            priority=priority,
            priority_prefix="workday",
            require_intern_if_not_priority=True,
        )

    before = {ats: len(bag["existing"][ats]) for ats in STRING_ATS}
    before["workday"] = len(bag["existing"]["workday"])

    merged: dict[str, list] = {}
    for ats in STRING_ATS:
        if ats == "ashby":
            as_lower = {s.lower(): s for s in bag["existing"]["ashby"]}
            for s in accepted["ashby"]:
                if s.lower() not in as_lower:
                    as_lower[s.lower()] = s
            merged[ats] = sorted(as_lower.values(), key=str.lower)
        else:
            merged[ats] = sorted(set(bag["existing"][ats]) | set(accepted[ats]), key=str.lower)

    existing_wd = dict(bag["existing"]["workday"])
    for e in wd_ok:
        existing_wd[_workday_key(e)] = {
            "company": e["company"],
            "subdomain": e["subdomain"],
            "wd_version": str(e["wd_version"]),
            **({"site": e["site"]} if e.get("site") and e["site"] != "careers" else {}),
        }
    merged_wd = sorted(existing_wd.values(), key=lambda x: (x["subdomain"], x.get("site", "careers")))

    after = {ats: len(merged[ats]) for ats in STRING_ATS}
    after["workday"] = len(merged_wd)
    added = {k: after[k] - before[k] for k in after}

    logger.info("COUNTS before=%s", before)
    logger.info("COUNTS after =%s", after)
    logger.info("COUNTS added =%s", added)

    if not dry_run:
        for ats in STRING_ATS:
            _write_json(DATA_DIR / f"{ats}_companies.json", merged[ats])
        _write_json(DATA_DIR / "workday_companies.json", merged_wd)
        logger.info("Wrote updated company JSON files to %s", DATA_DIR)
    else:
        logger.info("Dry-run: JSON files not written")

    return {"before": before, "after": after, "added": added}


def main() -> None:
    parser = argparse.ArgumentParser(description="Harvest + validate ATS board slugs")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--concurrency", type=int, default=30)
    args = parser.parse_args()
    summary = asyncio.run(run(dry_run=args.dry_run, concurrency=args.concurrency))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
