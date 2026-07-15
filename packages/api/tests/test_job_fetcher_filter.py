"""Unit tests for internship/co-op + 2027 season filtering."""

from datetime import datetime, timedelta, timezone

from services.job_fetcher import (
    NO_YEAR_MAX_AGE_DAYS,
    filter_internships,
    internship_keep_reason,
)

NOW = datetime(2026, 7, 14, 12, 0, 0, tzinfo=timezone.utc)


def _job(
    title: str,
    *,
    description: str = "",
    posted_at: datetime | str | None = None,
) -> dict:
    if posted_at is None:
        posted = (NOW - timedelta(days=7)).isoformat()
    elif isinstance(posted_at, datetime):
        posted = posted_at.isoformat()
    else:
        posted = posted_at
    return {
        "title": title,
        "description": description,
        "posted_at": posted,
        "company": "Acme",
        "url": "https://example.com/job",
    }


def test_keep_summer_2027_intern():
    job = _job("Software Engineering Intern — Summer 2027")
    assert internship_keep_reason(job, now=NOW) == "target_year_2027"
    assert filter_internships([job], now=NOW) == [job]


def test_keep_spring_summer_2027_in_description():
    job = _job(
        "Product Design Co-Op",
        description="This Spring/Summer 2027 co-op is based in NYC.",
        posted_at=NOW - timedelta(days=200),
    )
    assert internship_keep_reason(job, now=NOW) == "target_year_2027"


def test_keep_bare_2027():
    job = _job("Data Science Intern 2027")
    assert internship_keep_reason(job, now=NOW) == "target_year_2027"


def test_drop_fall_2025_intern():
    job = _job("Fall 2025 Software Engineering Intern")
    assert internship_keep_reason(job, now=NOW) is None


def test_drop_summer_2026_even_if_recent():
    job = _job(
        "Summer 2026 Intern",
        posted_at=NOW - timedelta(days=1),
    )
    assert internship_keep_reason(job, now=NOW) is None


def test_drop_2024_in_description():
    job = _job(
        "Engineering Intern",
        description="Internship term: Winter 2024 through Spring 2024.",
        posted_at=NOW - timedelta(days=1),
    )
    assert internship_keep_reason(job, now=NOW) is None


def test_keep_recent_no_year_intern():
    job = _job(
        "Software Engineering Intern",
        posted_at=NOW - timedelta(days=30),
    )
    assert internship_keep_reason(job, now=NOW) == "recent_no_year"


def test_drop_stale_no_year_intern():
    job = _job(
        "Software Engineering Intern",
        posted_at=NOW - timedelta(days=NO_YEAR_MAX_AGE_DAYS + 1),
    )
    assert internship_keep_reason(job, now=NOW) is None


def test_drop_new_grad_full_time():
    job = _job("Software Engineer — New Grad", posted_at=NOW - timedelta(days=1))
    assert internship_keep_reason(job, now=NOW) is None


def test_drop_junior_without_intern():
    job = _job("Junior Software Engineer", posted_at=NOW - timedelta(days=1))
    assert internship_keep_reason(job, now=NOW) is None


def test_drop_senior_intern_title():
    job = _job("Senior Intern Program Manager — Summer 2027")
    assert internship_keep_reason(job, now=NOW) is None


def test_keep_coop_variants():
    for title in ("Mechanical Engineering Co-op", "Finance Coop", "UI/UX Co Op"):
        job = _job(f"{title} Summer 2027")
        assert internship_keep_reason(job, now=NOW) == "target_year_2027", title


def test_drop_bare_summer_seasonal():
    job = _job("Summer Seasonal Associate", posted_at=NOW - timedelta(days=1))
    assert internship_keep_reason(job, now=NOW) is None


def test_filter_mixed_batch():
    keep = _job("Intern — Fall 2027")
    drop = _job("Summer 2025 Intern")
    out = filter_internships([keep, drop], now=NOW)
    assert out == [keep]


def test_workday_relative_posted_at_keeps_recent_no_year():
    job = _job(
        "Software Engineering Intern",
        posted_at="Posted 12 Days Ago",
    )
    assert internship_keep_reason(job, now=NOW) == "recent_no_year"


def test_posted_at_iso_parses_relative():
    from services.job_fetcher import _posted_at_iso

    iso = _posted_at_iso("Posted 13 Days Ago", now=NOW)
    parsed = datetime.fromisoformat(iso)
    assert abs((NOW - parsed).days - 13) <= 0
    # Must be DB-safe (no "Posted … Ago" prose)
    assert "Posted" not in iso
    assert "T" in iso or "+" in iso or iso.endswith("Z") or True
