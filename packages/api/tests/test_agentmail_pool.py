"""Inbox-POOL routing for the AgentMail relay (core/agentmail_inbox.py).

The pool upgrade replaced ONE shared inbox + a platform-wide verify mutex with
N inboxes + PER-INBOX mutexes: each Greenhouse apply claims a free inbox,
submits that address, and the webhook routes each inbound message by the
receiving inbox. These tests simulate the load-bearing scenarios in-memory
(fake Redis + fake Supabase — no live services):

1. Per-inbox locking: 3 applies claim 3 distinct inboxes concurrently; a 4th
   gets None (queues); releasing an inbox frees exactly that inbox.
2. 3 CONCURRENT verifications resolve independently: three parked applications,
   three code emails to three different inboxes → each code lands in its own
   application's Redis mailbox, no serialization, no cross-talk.
3. Inbox isolation: a code arriving at inbox A can never be consumed by an
   application assigned to inbox B — it parks under inbox A's slot instead.
4. Parked OTPs are per-inbox slots.
5. Mail addressed to no pool inbox drives nothing.
"""
import json
import os
import time
from datetime import datetime, timezone

import pytest

os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

import core.redis_client as rc  # noqa: E402
import core.agentmail_inbox as am  # noqa: E402

POOL = [
    "scoutapplyagent@agentmail.to",
    "scoutapplyagent2@agentmail.to",
    "scoutapplyagent3@agentmail.to",
]

GH_SENDER = "no-reply@greenhouse-mail.io"
# Same shape as Greenhouse's live template (see test_agentmail_otp.py), one
# distinct stand-in code per concurrent application.
BODY_TEMPLATE = (
    "Hi, Copy and paste this code into the security code field on your "
    "application: {code} After you enter the code, resubmit your application."
)


class FakeRedis:
    """The subset of redis-py the relay uses: SET NX EX, GET, SETEX, DEL, and
    the compare-and-delete Lua used to release mutexes."""

    def __init__(self):
        self.store: dict[str, str] = {}

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.store:
            return None
        self.store[key] = str(value)
        return True

    def setex(self, key, ttl, value):
        self.store[key] = str(value)
        return True

    def get(self, key):
        return self.store.get(key)

    def delete(self, *keys):
        return sum(1 for k in keys if self.store.pop(k, None) is not None)

    def eval(self, _script, _numkeys, key, token):
        if self.store.get(key) == token:
            del self.store[key]
            return 1
        return 0


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    """Chainable stand-in for the supabase-py query builder, covering exactly
    the chains agentmail_inbox builds (select+eq/not_.is_/order/limit/ilike,
    update+eq)."""

    def __init__(self, table: str, db: "FakeSupabase"):
        self._table = table
        self._db = db
        self._eq: list[tuple[str, object]] = []
        self._not_null: list[str] = []
        self._negate = False
        self._patch = None
        self._ilike_miss = False

    def select(self, *_args, **_kw):
        return self

    def update(self, patch):
        self._patch = patch
        return self

    def eq(self, field, value):
        self._eq.append((field, value))
        return self

    def in_(self, field, values):
        self._eq.append((field, tuple(values)))
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def is_(self, field, value):
        assert self._negate and value == "null"
        self._not_null.append(field)
        self._negate = False
        return self

    def ilike(self, _field, _pattern):
        self._ilike_miss = True  # pool tests never rely on the legacy fallback
        return self

    def order(self, *_args, **_kw):
        return self

    def limit(self, _n):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self._patch is not None:
            self._db.updates.append((self._table, self._patch, dict(self._eq)))
            return FakeResult(None)
        if self._ilike_miss:
            return FakeResult([])
        rows = self._db.tables.get(self._table, [])
        for field, value in self._eq:
            if isinstance(value, tuple):
                rows = [r for r in rows if r.get(field) in value]
            else:
                rows = [r for r in rows if r.get(field) == value]
        for field in self._not_null:
            rows = [r for r in rows if r.get(field) is not None]
        return FakeResult([dict(r) for r in rows])


class FakeSupabase:
    def __init__(self, tables=None):
        self.tables = tables or {}
        self.updates: list[tuple[str, dict, dict]] = []

    def table(self, name):
        return FakeQuery(name, self)


@pytest.fixture()
def pool_env(monkeypatch):
    monkeypatch.setenv("AGENTMAIL_INBOX_IDS", ",".join(POOL))
    r = FakeRedis()
    monkeypatch.setattr(rc, "get_redis", lambda: r)
    monkeypatch.setattr(am, "get_redis", lambda: r)
    monkeypatch.setattr(am, "_send_otp_notice", lambda **_kw: None)
    return r


def _awaiting_app(app_id: str, inbox: str, gate_epoch: float) -> dict:
    return {
        "id": app_id,
        "user_id": f"user-{app_id}",
        "job_id": f"job-{app_id}",
        "status": "awaiting_code",
        "submitted_email": inbox,
        "gate_hit_at": datetime.fromtimestamp(gate_epoch, timezone.utc).isoformat(),
    }


def _otp_message(msg_id: str, inbox: str, code: str, ts: float) -> dict:
    return {
        "message_id": msg_id,
        "inbox_id": inbox,
        "from": f"Greenhouse <{GH_SENDER}>",
        "to": [inbox],
        "timestamp": ts,
        "subject": "Security code for your application",
        "text": BODY_TEMPLATE.format(code=code),
    }


def test_pool_parsing(pool_env, monkeypatch):
    assert am.inbox_pool() == POOL
    assert am.inbox_address() == POOL[0]
    assert am.is_configured()
    # Legacy single-inbox fallback keeps a pre-pool deploy working.
    monkeypatch.delenv("AGENTMAIL_INBOX_IDS")
    monkeypatch.setenv("AGENTMAIL_INBOX_ID", POOL[0])
    assert am.inbox_pool() == [POOL[0]]


def test_per_inbox_locking_three_concurrent_one_queued(pool_env):
    tokens = ["tok-1", "tok-2", "tok-3", "tok-4"]
    claimed = [am.acquire_pool_inbox(t) for t in tokens[:3]]
    # Three concurrent applies hold three DISTINCT inboxes simultaneously.
    assert sorted(claimed) == sorted(POOL)
    # A 4th concurrent verification finds every inbox locked → queues (None).
    assert am.acquire_pool_inbox(tokens[3]) is None
    # Releasing one inbox frees exactly that inbox for the queued apply.
    am.release_pool_inbox(claimed[1], "tok-2")
    assert am.acquire_pool_inbox(tokens[3]) == claimed[1]
    # A stale token cannot release an inbox a later apply now holds.
    am.release_pool_inbox(claimed[1], "tok-2")
    assert am.acquire_pool_inbox("tok-5") is None


def test_three_concurrent_verifications_resolve_independently(pool_env, monkeypatch):
    r = pool_env
    now = time.time()
    apps = [_awaiting_app(f"app-{i}", POOL[i], now - 60) for i in range(3)]
    monkeypatch.setattr(am, "supabase", FakeSupabase({"applications": apps}))

    # All three applications hold their inbox and are parked at the gate at once.
    for i in range(3):
        assert am.acquire_pool_inbox(f"tok-{i}") == POOL[i]
        r.set(rc.gate_key(f"app-{i}"), str(now - 60))

    codes = ["TCaaaaWw", "TCbbbbWw", "TCccccWw"]
    # Deliver out of order — routing is by receiving inbox, not arrival order.
    for i in (1, 2, 0):
        outcome = am.handle_inbound_message(
            _otp_message(f"msg-{i}", POOL[i], codes[i], now)
        )
        assert outcome == f"otp:app-{i}"

    # Each code landed in ITS OWN application's mailbox — no cross-talk.
    for i in range(3):
        assert r.get(rc.verification_code_key(f"app-{i}")) == codes[i]


def test_code_at_wrong_inbox_never_crosses_applications(pool_env, monkeypatch):
    r = pool_env
    now = time.time()
    # Only one application, assigned to inbox #2 and parked at the gate.
    apps = [_awaiting_app("app-x", POOL[1], now - 60)]
    monkeypatch.setattr(am, "supabase", FakeSupabase({"applications": apps}))
    r.set(rc.gate_key("app-x"), str(now - 60))

    # An OTP arriving at inbox #1 must NOT be consumed for app-x (different
    # inbox context) — it parks under inbox #1's slot instead.
    outcome = am.handle_inbound_message(_otp_message("msg-y", POOL[0], "TCzzzzWw", now))
    assert outcome == "otp:parked"
    assert r.get(rc.verification_code_key("app-x")) is None
    parked = json.loads(r.get(rc.pending_otp_key(POOL[0])))
    assert parked["code"] == "TCzzzzWw"
    assert r.get(rc.pending_otp_key(POOL[1])) is None


def test_parked_otp_is_per_inbox_slot(pool_env, monkeypatch):
    r = pool_env
    now = time.time()
    monkeypatch.setattr(am, "supabase", FakeSupabase({"applications": []}))

    # The submit→gate race on two inboxes at once: both codes park independently.
    assert am.handle_inbound_message(
        _otp_message("msg-a", POOL[0], "TCaaaaWw", now)
    ) == "otp:parked"
    assert am.handle_inbound_message(
        _otp_message("msg-b", POOL[2], "TCbbbbWw", now)
    ) == "otp:parked"
    assert json.loads(r.get(rc.pending_otp_key(POOL[0])))["code"] == "TCaaaaWw"
    assert json.loads(r.get(rc.pending_otp_key(POOL[2])))["code"] == "TCbbbbWw"
    assert r.get(rc.pending_otp_key(POOL[1])) is None


def test_mail_to_no_pool_inbox_is_skipped(pool_env, monkeypatch):
    monkeypatch.setattr(am, "supabase", FakeSupabase({"applications": []}))
    msg = _otp_message("msg-z", "not-ours@agentmail.to", "TCzzzzWw", time.time())
    assert am.handle_inbound_message(msg) == "skipped:wrong_recipient"
