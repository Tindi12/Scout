"""Cross-user authorization isolation (Epic 11 hardening).

Proves, end-to-end through the real FastAPI routes, that one authenticated user cannot
read or list another user's resources. These are real assertions on real status
codes/payloads (403 / caller-scoped list / 401), not "the route is defined" smoke tests.

The DB is replaced with an in-memory fake so the test is hermetic (no Supabase), but the
auth dependency, ownership checks, and route logic all run for real. Auth uses the
trusted-proxy path (X-Scout-Internal + X-Clerk-User-Id), the same headers the Next.js
proxy sends, so we can act as two distinct users.
"""
import os

# Auth.py reads the internal-proxy secret at import. setdefault (not override) so a real
# value from .env wins; we read the effective value below for the request headers. We do
# NOT seed SUPABASE_URL/REDIS_URL here — those come from .env like the other tests, so we
# don't pollute the shared process env for sibling tests. This test never hits the real
# DB anyway: the route modules' supabase client is swapped for an in-memory fake below.
os.environ.setdefault("SCOUT_INTERNAL_API_SECRET", "test-internal-secret")

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import routes.applications as applications_route  # noqa: E402
import routes.resume as resume_route  # noqa: E402

_SECRET = os.environ["SCOUT_INTERNAL_API_SECRET"]

# ---------------------------------------------------------------------------
# Fixture data: two users; the analysis and application belong to user A only.
# ---------------------------------------------------------------------------
USER_A = {"id": "aaaaaaaa-0000-0000-0000-000000000001", "clerk_id": "user_a"}
USER_B = {"id": "bbbbbbbb-0000-0000-0000-000000000002", "clerk_id": "user_b"}

ANALYSIS_A = {
    "id": "analysis-a",
    "resume_id": "resume-a",
    "target_role": "SWE Intern",
    "score": 82,
    "breakdown": {"experience": 1},
    "weaknesses": ["needs metrics"],
    "user_id": USER_A["id"],
}

APPLICATION_A = {
    "id": "app-a",
    "user_id": USER_A["id"],
    "job_id": "job-a",
    "scout_run_id": "run-a",
    "status": "queued",
    "company": "Acme",
    "role": "SWE Intern",
    "error_message": None,
    "applied_at": None,
    "created_at": "2026-06-01T00:00:00Z",
}

_DATASET = {
    "users": [USER_A, USER_B],
    "analyses": [ANALYSIS_A],
    "applications": [APPLICATION_A],
}


class _Result:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    """Minimal supabase-py query stand-in: applies .eq() filters against an in-memory
    table and honors .single()/.limit()/.range()."""

    def __init__(self, rows):
        self._rows = rows
        self._filters = []
        self._single = False
        self._limit = None
        self._range = None

    def select(self, *args, **kwargs):
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def is_(self, *args, **kwargs):
        return self

    def in_(self, col, vals):
        self._filters.append((col, ("__in__", list(vals))))
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def single(self):
        self._single = True
        return self

    def maybe_single(self):
        self._single = True
        return self

    def _match(self, row):
        for col, val in self._filters:
            if isinstance(val, tuple) and val and val[0] == "__in__":
                if row.get(col) not in val[1]:
                    return False
            elif row.get(col) != val:
                return False
        return True

    def execute(self):
        matches = [r for r in self._rows if self._match(r)]
        if self._range is not None:
            start, end = self._range
            matches = matches[start : end + 1]
        elif self._limit is not None:
            matches = matches[: self._limit]
        if self._single:
            return _Result(matches[0] if matches else None)
        return _Result(matches, count=len(matches))


class _FakeSupabase:
    def __init__(self, dataset):
        self._dataset = dataset

    def table(self, name):
        # Fresh query each call with a copy of the rows (filters don't leak between calls).
        return _Query(list(self._dataset.get(name, [])))


# Point the route modules at the fake DB (both import `supabase` into their namespace).
_fake = _FakeSupabase(_DATASET)
resume_route.supabase = _fake
applications_route.supabase = _fake

client = TestClient(main.app)


def _as(clerk_id: str) -> dict:
    return {"X-Scout-Internal": _SECRET, "X-Clerk-User-Id": clerk_id}


def test_user_b_cannot_read_user_a_analysis():
    resp = client.get("/resume/analysis/analysis-a", headers=_as("user_b"))
    assert resp.status_code == 403


def test_user_a_can_read_own_analysis():
    resp = client.get("/resume/analysis/analysis-a", headers=_as("user_a"))
    assert resp.status_code == 200
    assert resp.json()["id"] == "analysis-a"


def test_applications_list_is_scoped_to_caller():
    # User B must not see user A's application...
    resp_b = client.get("/applications/", headers=_as("user_b"))
    assert resp_b.status_code == 200
    assert resp_b.json() == []

    # ...while user A sees their own.
    resp_a = client.get("/applications/", headers=_as("user_a"))
    assert resp_a.status_code == 200
    assert [a["id"] for a in resp_a.json()] == ["app-a"]


def test_unauthenticated_request_is_rejected():
    resp = client.get("/applications/")
    assert resp.status_code == 401
