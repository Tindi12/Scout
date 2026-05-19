from services.job_matcher import _assign_fit_categories, _hard_score, _score_job


def test_assign_fit_categories_distributes_three_buckets():
    jobs = [{"id": str(i), "final_score": 100 - i} for i in range(10)]
    out = _assign_fit_categories(jobs)
    cats = [j["category"] for j in out]
    assert cats.count("STRONG_FIT") == 3
    assert cats.count("GOOD_FIT") == 4
    assert cats.count("STRETCH") == 3


def test_hard_score_uses_semantic_when_no_skills_pro():
    hard, matched = _hard_score([], [], {"similarity": 0.8}, is_pro=True)
    assert hard == 80.0
    assert matched == []


def test_score_job_pro_semantic_only_when_no_skills():
    row = _score_job(
        {
            "id": "1",
            "title": "Intern",
            "company": "Co",
            "skills_required": [],
            "similarity": 0.75,
        },
        ["python"],
        is_pro=True,
    )
    assert row is not None
    assert row["final_score"] == 75.0
    assert row["hard_score"] == 75.0


def test_score_job_rejects_below_minimum():
    assert (
        _score_job(
            {"id": "1", "skills_required": ["rust", "go", "c++"]},
            ["python"],
            is_pro=False,
        )
        is None
    )
