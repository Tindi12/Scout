from services.job_fetcher import _skill_in_description, extract_skills
from services.job_matcher import _hard_score, _score_job, _skill_matches
from services.role_keywords import role_relevance_score


def test_skill_in_description_rejects_r_in_intern():
    assert not _skill_in_description("R", "software engineering intern at company")


def test_skill_in_description_accepts_r_programming():
    assert _skill_in_description("R", "experience with R programming and statistics")


def test_skill_matches_rejects_single_letter_via_substring():
    assert not _skill_matches("r", ["python", "autocad"])


def test_hard_score_not_inflated_by_r_skill():
    hard, matched = _hard_score(
        ["R", "Python", "MATLAB"],
        ["autocad", "structural analysis"],
    )
    assert "R" not in matched
    assert hard < 100


def test_pharmacy_job_excluded_for_civil_eng():
    score = role_relevance_score(
        {
            "title": "Pharmacy Intern",
            "description": "Assist pharmacists with prescriptions.",
        },
        ["civil_eng"],
    )
    assert score == 0.0


def test_civil_job_scores_for_civil_eng():
    score = role_relevance_score(
        {
            "title": "Civil Engineering Intern",
            "description": "Structural analysis, AutoCAD, infrastructure projects.",
        },
        ["civil_eng"],
    )
    assert score >= 40


def test_score_job_caps_with_low_resume_quality():
    row = _score_job(
        {
            "id": "1",
            "title": "Civil Engineering Intern",
            "company": "AECOM",
            "skills_required": ["MATLAB", "AutoCAD"],
            "similarity": 0.82,
            "description": "Structural and transportation projects.",
        },
        ["autocad", "matlab", "structural analysis"],
        target_role_ids=["civil_eng"],
        target_role_label="Civil Engineering Intern",
        resume_quality_score=34,
    )
    assert row is not None
    assert row["final_score"] < 70
    assert row["final_score"] <= row["role_score"]


def test_score_job_rejects_irrelevant_track():
    assert (
        _score_job(
            {
                "id": "2",
                "title": "Pharmacy Intern",
                "skills_required": ["Excel"],
                "description": "Retail pharmacy.",
            },
            ["autocad"],
            target_role_ids=["civil_eng"],
            target_role_label="Civil Engineering Intern",
            resume_quality_score=80,
        )
        is None
    )
