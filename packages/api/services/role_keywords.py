"""Role-aware keywords for job relevance filtering (from data/roles.json)."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "roles.json"

# Hard excludes when the user's track clearly doesn't match (title-level).
_CROSS_TRACK_TITLE_EXCLUDES: dict[str, tuple[str, ...]] = {
    "civil_eng": (
        "pharmacy",
        "pharmacist",
        "pharmaceutical",
        "nursing",
        "nurse",
        "dental",
        "medical assistant",
        "clinical research associate",
        "biotech lab",
    ),
    "swe": (
        "pharmacy",
        "pharmacist",
        "nursing",
        "civil engineer",
        "structural engineer",
        "construction superintendent",
    ),
    "mech_eng": (
        "pharmacy",
        "pharmacist",
        "software engineer",
        "frontend",
        "backend developer",
    ),
    "chem_eng": (
        "pharmacy technician",
        "pharmacist",
        "software engineer",
        "frontend developer",
    ),
    "elec_eng": (
        "pharmacy",
        "pharmacist",
        "civil engineer",
        "mechanical designer",
    ),
    "bio_eng": (
        "pharmacy",
        "pharmacist",
        "software engineer",
        "civil engineer",
    ),
    "ml": (
        "pharmacy",
        "pharmacist",
        "civil engineer",
        "construction",
    ),
    "aerospace_eng": (
        "pharmacy",
        "pharmacist",
        "nursing",
        "frontend developer",
    ),
    "environmental_eng": (
        "pharmacy",
        "pharmacist",
        "software engineer",
        "frontend",
    ),
    "nuclear_eng": (
        "pharmacy",
        "pharmacist",
        "frontend developer",
    ),
    "industrial_eng": (
        "pharmacy",
        "pharmacist",
        "nursing",
    ),
    "research": (
        "pharmacy",
        "pharmacist",
        "retail",
    ),
}

_DEFAULT_TRACK_TOKENS: tuple[str, ...] = (
    "engineering",
    "engineer",
    "intern",
    "internship",
    "co-op",
    "coop",
)


@lru_cache(maxsize=1)
def load_roles_catalog() -> list[dict]:
    with open(_DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def _role_row(role_id: str) -> dict | None:
    for row in load_roles_catalog():
        if row.get("role_id") == role_id:
            return row
    return None


def keywords_for_roles(target_role_ids: list[str]) -> tuple[str, ...]:
    keywords: set[str] = set()
    for role_id in target_role_ids:
        row = _role_row(role_id)
        if not row:
            continue
        label = str(row.get("label") or "")
        keywords.add(role_id.replace("_", " "))
        for part in re.split(r"[\s/]+", label.lower()):
            if len(part) >= 3:
                keywords.add(part)
        for skill in row.get("required_skills") or []:
            if isinstance(skill, str) and len(skill.strip()) >= 3:
                keywords.add(skill.lower().strip())
        for skill in row.get("nice_to_have") or []:
            if isinstance(skill, str) and len(skill.strip()) >= 3:
                keywords.add(skill.lower().strip())
    return tuple(sorted(keywords))


def title_excludes_for_roles(target_role_ids: list[str]) -> tuple[str, ...]:
    excludes: set[str] = set()
    for role_id in target_role_ids:
        for phrase in _CROSS_TRACK_TITLE_EXCLUDES.get(role_id, ()):
            excludes.add(phrase)
    return tuple(sorted(excludes))


def role_relevance_score(
    job: dict,
    target_role_ids: list[str],
    target_role_label: str | None = None,
) -> float:
    """
    0–100 score for how well a job title/description fits the user's target track.
    Returns 0 when the title clearly belongs to another domain (e.g. pharmacy for civil).
    """
    if not target_role_ids and not target_role_label:
        return 50.0

    title = (job.get("title") or "").lower()
    description = (job.get("description") or "").lower()
    blob = f"{title} {description[:1200]}"

    ids = target_role_ids or []
    if target_role_label and not ids:
        # Infer from analysis label when target_roles empty
        label_l = target_role_label.lower()
        for row in load_roles_catalog():
            if str(row.get("label", "")).lower() == label_l:
                ids = [str(row["role_id"])]
                break

    for phrase in title_excludes_for_roles(ids):
        if phrase in title:
            return 0.0

    positive = set(keywords_for_roles(ids))
    if target_role_label:
        for part in re.split(r"[\s/]+", target_role_label.lower()):
            if len(part) >= 3:
                positive.add(part)

    if not positive:
        positive = set(_DEFAULT_TRACK_TOKENS)

    title_hits = sum(1 for kw in positive if kw in title)
    desc_hits = sum(1 for kw in positive if kw in description)

    # Title match matters more than body keyword spam.
    raw = title_hits * 22 + desc_hits * 4
    if title_hits == 0 and desc_hits == 0:
        # Generic "Summer Intern" with no track signal — weak fit.
        if any(tok in title for tok in _DEFAULT_TRACK_TOKENS):
            return 18.0
        return 8.0

    return float(min(100.0, raw))
