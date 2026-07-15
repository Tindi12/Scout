"""Regression tests for Browserbase-backed ATS file uploads."""
from __future__ import annotations

import asyncio
from functools import wraps
from types import SimpleNamespace

from browser_use.agent.views import ActionResult
import services.browser_agent as upload


def _async_test(fn):
    @wraps(fn)
    def run(*args, **kwargs):
        return asyncio.run(fn(*args, **kwargs))

    return run


def test_file_path_resolution_keeps_resume_cover_and_transcript_distinct():
    available = [
        r"C:\tmp\Candidate_Resume.pdf",
        r"C:\tmp\Candidate_Cover_Letter.pdf",
        r"C:\tmp\Candidate_Transcript.pdf",
    ]

    assert upload._resolve_upload_path("resume.pdf", available) == available[0]
    assert upload._resolve_upload_path("cover.pdf", available) == available[1]
    assert upload._resolve_upload_path("transcript.pdf", available) == available[2]


def test_upload_state_is_isolated_between_application_tool_registries():
    first = upload._install_robust_upload(_Tools(), "session-one")
    second = upload._install_robust_upload(_Tools(), "session-two")

    first["fields"]["main:resume"] = {"status": "failed", "failures": 1}
    assert second["fields"] == {}
    assert first["staged_uploads"] is not second["staged_uploads"]


class _Registry:
    def __init__(self):
        self.actions = {}

    def action(self, _description, *, param_model):
        assert param_model is upload._UploadResumeAction

        def register(fn):
            self.actions[fn.__name__] = fn
            return fn

        return register


class _Tools:
    def __init__(self):
        self.registry = _Registry()


class _Node:
    def __init__(self, backend_node_id: int, field_id: str):
        self.backend_node_id = backend_node_id
        self.frame_id = None
        self.attributes = {"id": field_id, "type": "file"}


class _Browser:
    def __init__(self, nodes):
        self.nodes = nodes

    async def get_selector_map(self):
        return {index: node for index, node in enumerate(self.nodes, start=1)}

    def find_file_input_near_element(self, node):
        return node

    def is_file_input(self, node):
        return node in self.nodes


@_async_test
async def test_remote_readiness_probe_waits_for_exact_name_and_size(monkeypatch):
    monkeypatch.setattr(upload, "_REMOTE_FILE_READY_POLL", 0)
    reads = iter(
        [
            {"count": 1, "name": "Resume.pdf", "size": 0},
            {"count": 1, "name": "Resume.pdf", "size": 1234},
        ]
    )

    class Runtime:
        async def evaluate(self, **_kwargs):
            return {"result": {"objectId": "probe"}}

        async def callFunctionOn(self, **_kwargs):
            return {"result": {"value": next(reads)}}

        async def releaseObject(self, **_kwargs):
            return {}

    class DOM:
        async def describeNode(self, **_kwargs):
            return {"node": {"backendNodeId": 77}}

        async def setFileInputFiles(self, **_kwargs):
            return {}

    cdp = SimpleNamespace(
        cdp_client=SimpleNamespace(send=SimpleNamespace(Runtime=Runtime(), DOM=DOM())),
        session_id="cdp",
    )
    ready, state = await upload._wait_for_remote_file(
        cdp,
        "/tmp/.uploads/Resume.pdf",
        expected_name="Resume.pdf",
        expected_size=1234,
    )

    assert ready is True
    assert state["size"] == 1234


@_async_test
async def test_native_upload_stages_once_and_reuses_remote_file(tmp_path, monkeypatch):
    path = tmp_path / "Resume.pdf"
    path.write_bytes(b"pdf-bytes")
    stage_calls = []

    uploads = SimpleNamespace(
        create=lambda session_id, *, file: stage_calls.append((session_id, file))
    )
    monkeypatch.setattr(
        upload,
        "get_browserbase_client",
        lambda: SimpleNamespace(sessions=SimpleNamespace(uploads=uploads)),
    )

    async def ready(*_args, **_kwargs):
        return True, {"count": 1, "name": path.name, "size": path.stat().st_size}

    async def attached(*_args, **_kwargs):
        return {"count": 1, "name": path.name, "size": path.stat().st_size}

    monkeypatch.setattr(upload, "_wait_for_remote_file", ready)
    monkeypatch.setattr(upload, "_read_attached_file", attached)

    class DOM:
        async def setFileInputFiles(self, **_kwargs):
            return {}

    cdp = SimpleNamespace(
        cdp_client=SimpleNamespace(send=SimpleNamespace(DOM=DOM())),
        session_id="cdp",
    )

    class Browser:
        async def cdp_client_for_node(self, _node):
            return cdp

    staged = {}
    node = _Node(10, "resume")
    first = await upload._attach_file_native(
        Browser(), node, str(path), "bb-session", staged
    )
    second = await upload._attach_file_native(
        Browser(), node, str(path), "bb-session", staged
    )

    assert first.error is None
    assert second.error is None
    assert len(stage_calls) == 1
    assert staged["/tmp/.uploads/Resume.pdf"]["size"] == len(b"pdf-bytes")


@_async_test
async def test_attempt_outcome_ignores_stale_error_and_accepts_positive_state(
    monkeypatch,
):
    monkeypatch.setattr(upload, "_UPLOAD_SETTLE_MIN", 0)
    monkeypatch.setattr(upload, "_UPLOAD_ATTACHED_QUIET_GRACE", 0)

    async def read(*_args, **_kwargs):
        return {
            "attached": {"count": 1, "name": "Resume.pdf", "size": 42},
            "acceptedControl": True,
            "networkAccepted": True,
            # An alert that existed before the attempt is intentionally absent here.
            "newErrors": [],
        }

    monkeypatch.setattr(upload, "_read_upload_attempt", read)
    outcome = await upload._await_upload_outcome(
        object(),
        object(),
        "attempt",
        expected_name="Resume.pdf",
        expected_size=42,
    )

    assert outcome["status"] == "accepted"
    assert outcome["signal"] == "network_success"


@_async_test
async def test_attempt_outcome_does_not_accept_on_remove_control_alone(monkeypatch):
    """Ashby shows Delete/Remove before setFormValueToFile — that is not success."""
    monkeypatch.setattr(upload, "_UPLOAD_SETTLE_MIN", 0)
    monkeypatch.setattr(upload, "_UPLOAD_SETTLE_TIMEOUT", 0)
    monkeypatch.setattr(upload, "_UPLOAD_SETTLE_POLL", 0)

    async def read(*_args, **_kwargs):
        return {
            "attached": {"count": 1, "name": "Resume.pdf", "size": 42},
            "acceptedControl": True,
            "networkAccepted": False,
            "networkFailed": False,
            "newErrors": [],
        }

    monkeypatch.setattr(upload, "_read_upload_attempt", read)
    outcome = await upload._await_upload_outcome(
        object(),
        object(),
        "attempt",
        expected_name="Resume.pdf",
        expected_size=42,
    )

    assert outcome["status"] == "network_unconfirmed"
    assert "never confirmed" in (outcome.get("error") or "")


@_async_test
async def test_attempt_outcome_rejects_network_failed(monkeypatch):
    async def read(*_args, **_kwargs):
        return {
            "attached": {"count": 1, "name": "Resume.pdf", "size": 42},
            "acceptedControl": True,
            "networkAccepted": False,
            "networkFailed": True,
            "newErrors": [],
        }

    monkeypatch.setattr(upload, "_read_upload_attempt", read)
    outcome = await upload._await_upload_outcome(
        object(),
        object(),
        "attempt",
        expected_name="Resume.pdf",
        expected_size=42,
    )

    assert outcome["status"] == "rejected"
    assert "network" in (outcome.get("error") or "").lower()


@_async_test
async def test_attempt_outcome_rejects_new_error(monkeypatch):
    async def read(*_args, **_kwargs):
        return {
            "attached": {"count": 1, "name": "Resume.pdf", "size": 42},
            "acceptedControl": True,
            "newErrors": ["Resume.pdf failed to upload"],
        }

    monkeypatch.setattr(upload, "_read_upload_attempt", read)
    outcome = await upload._await_upload_outcome(
        object(),
        object(),
        "attempt",
        expected_name="Resume.pdf",
        expected_size=42,
    )

    assert outcome == {
        "status": "rejected",
        "error": "Resume.pdf failed to upload",
        "details": {
            "attached": {"count": 1, "name": "Resume.pdf", "size": 42},
            "acceptedControl": True,
            "newErrors": ["Resume.pdf failed to upload"],
        },
    }


@_async_test
async def test_retry_targets_same_field_and_success_resets_only_that_field(
    tmp_path, monkeypatch
):
    resume = tmp_path / "Resume.pdf"
    resume.write_bytes(b"resume")
    resume_node = _Node(10, "resume")
    cover_node = _Node(20, "cover-letter")
    browser = _Browser([resume_node, cover_node])
    tools = _Tools()
    state = upload._install_robust_upload(tools, "bb-session")
    used_nodes = []
    outcomes = iter(
        [
            {"status": "rejected", "error": "fresh failure", "details": {}},
            # Auto byte-injection fallback after native rejection
            {"status": "rejected", "error": "fresh failure", "details": {}},
            {"status": "accepted", "signal": "network_success", "details": {}},
        ]
    )

    async def start(*_args, **_kwargs):
        return {"baselineErrors": ["old stale failure"]}

    async def stop(*_args, **_kwargs):
        return None

    async def clear(*_args, **_kwargs):
        return None

    async def attach(_browser, node, _path, _session, _staged):
        used_nodes.append(node)
        return ActionResult(extracted_content="attached")

    async def attach_bytes(*_args, **_kwargs):
        return ActionResult(extracted_content="bytes")

    async def settle(*_args, **_kwargs):
        return next(outcomes)

    async def count(_browser, node):
        return 1 if node is resume_node else 0

    monkeypatch.setattr(upload, "_start_upload_attempt", start)
    monkeypatch.setattr(upload, "_stop_upload_attempt", stop)
    monkeypatch.setattr(upload, "_clear_file_input", clear)
    monkeypatch.setattr(upload, "_attach_file_native", attach)
    monkeypatch.setattr(upload, "_attach_resume_bytes", attach_bytes)
    monkeypatch.setattr(upload, "_await_upload_outcome", settle)
    monkeypatch.setattr(upload, "_count_attached_files", count)

    action = tools.registry.actions["upload_file"]
    first = await action(
        SimpleNamespace(path=str(resume), index=1),
        browser,
        [str(resume)],
    )
    second = await action(
        SimpleNamespace(path=str(resume), index=None),
        browser,
        [str(resume)],
    )

    key = upload._upload_field_key(resume_node)
    assert first.error and "Retry" in first.error
    assert second.error is None
    assert used_nodes == [resume_node, resume_node]
    assert state["fields"][key]["status"] == "accepted"
    assert state["fields"][key]["failures"] == 0
    assert upload._upload_field_key(cover_node) not in state["fields"]


@_async_test
async def test_native_unconfirmed_falls_back_to_byte_injection(tmp_path, monkeypatch):
    """S3 can fail after native attach — retry with byte injection + fresh observer."""
    resume = tmp_path / "Resume.pdf"
    resume.write_bytes(b"resume-bytes")
    resume_node = _Node(10, "resume")
    browser = _Browser([resume_node])
    tools = _Tools()
    state = upload._install_robust_upload(tools, "bb-session")
    outcomes = iter(
        [
            {
                "status": "network_unconfirmed",
                "error": "never confirmed",
                "details": {},
            },
            {"status": "accepted", "signal": "network_success", "details": {}},
        ]
    )
    clear_calls = []
    bytes_calls = []

    async def start(*_args, **_kwargs):
        return {"baselineErrors": []}

    async def stop(*_args, **_kwargs):
        return None

    async def clear(*_args, **_kwargs):
        clear_calls.append(True)

    async def attach_native(*_args, **_kwargs):
        return ActionResult(extracted_content="native")

    async def attach_bytes(*_args, **_kwargs):
        bytes_calls.append(True)
        return ActionResult(extracted_content="bytes")

    async def settle(*_args, **_kwargs):
        return next(outcomes)

    monkeypatch.setattr(upload, "_start_upload_attempt", start)
    monkeypatch.setattr(upload, "_stop_upload_attempt", stop)
    monkeypatch.setattr(upload, "_clear_file_input", clear)
    monkeypatch.setattr(upload, "_attach_file_native", attach_native)
    monkeypatch.setattr(upload, "_attach_resume_bytes", attach_bytes)
    monkeypatch.setattr(upload, "_await_upload_outcome", settle)

    action = tools.registry.actions["upload_file"]
    result = await action(
        SimpleNamespace(path=str(resume), index=1),
        browser,
        [str(resume)],
    )

    key = upload._upload_field_key(resume_node)
    assert result.error is None
    assert len(bytes_calls) == 1
    assert len(clear_calls) >= 2  # before native + before byte retry
    assert state["fields"][key]["status"] == "accepted"


@_async_test
async def test_native_rejected_also_falls_back_to_byte_injection(tmp_path, monkeypatch):
    resume = tmp_path / "Resume.pdf"
    resume.write_bytes(b"resume-bytes")
    resume_node = _Node(10, "resume")
    browser = _Browser([resume_node])
    tools = _Tools()
    state = upload._install_robust_upload(tools, "bb-session")
    outcomes = iter(
        [
            {
                "status": "rejected",
                "error": "Resume.pdf failed to upload",
                "details": {},
            },
            {"status": "accepted", "signal": "network_success", "details": {}},
        ]
    )

    async def noop(*_args, **_kwargs):
        return None

    async def start(*_args, **_kwargs):
        return {"baselineErrors": ["Resume.pdf failed to upload"]}

    async def attach_native(*_args, **_kwargs):
        return ActionResult(extracted_content="native")

    async def attach_bytes(*_args, **_kwargs):
        return ActionResult(extracted_content="bytes")

    async def settle(*_args, **_kwargs):
        return next(outcomes)

    monkeypatch.setattr(upload, "_start_upload_attempt", start)
    monkeypatch.setattr(upload, "_stop_upload_attempt", noop)
    monkeypatch.setattr(upload, "_clear_file_input", noop)
    monkeypatch.setattr(upload, "_attach_file_native", attach_native)
    monkeypatch.setattr(upload, "_attach_resume_bytes", attach_bytes)
    monkeypatch.setattr(upload, "_await_upload_outcome", settle)

    action = tools.registry.actions["upload_file"]
    result = await action(
        SimpleNamespace(path=str(resume), index=1),
        browser,
        [str(resume)],
    )

    key = upload._upload_field_key(resume_node)
    assert result.error is None
    assert state["fields"][key]["status"] == "accepted"


@_async_test
async def test_multiple_upload_fields_have_independent_retry_state(
    tmp_path, monkeypatch
):
    resume = tmp_path / "Resume.pdf"
    cover = tmp_path / "Cover_Letter.pdf"
    resume.write_bytes(b"resume")
    cover.write_bytes(b"cover")
    resume_node = _Node(10, "resume")
    cover_node = _Node(20, "cover")
    browser = _Browser([resume_node, cover_node])
    tools = _Tools()
    state = upload._install_robust_upload(tools, "bb-session")
    outcomes = iter(
        [
            {"status": "rejected", "error": "resume failed", "details": {}},
            # Auto byte-injection fallback after native rejection
            {"status": "rejected", "error": "resume failed", "details": {}},
            {"status": "accepted", "signal": "network_success", "details": {}},
        ]
    )

    async def attach(*_args, **_kwargs):
        return ActionResult(extracted_content="attached")

    async def attach_bytes(*_args, **_kwargs):
        return ActionResult(extracted_content="bytes")

    async def clear(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        upload,
        "_start_upload_attempt",
        lambda *_args, **_kwargs: _async_value({"baselineErrors": []}),
    )
    monkeypatch.setattr(
        upload, "_stop_upload_attempt", lambda *_args, **_kwargs: _async_value(None)
    )
    monkeypatch.setattr(upload, "_clear_file_input", clear)
    monkeypatch.setattr(upload, "_attach_file_native", attach)
    monkeypatch.setattr(upload, "_attach_resume_bytes", attach_bytes)
    monkeypatch.setattr(
        upload,
        "_await_upload_outcome",
        lambda *_args, **_kwargs: _async_value(next(outcomes)),
    )

    action = tools.registry.actions["upload_file"]
    await action(
        SimpleNamespace(path=str(resume), index=1),
        browser,
        [str(resume), str(cover)],
    )
    await action(
        SimpleNamespace(path=str(cover), index=2),
        browser,
        [str(resume), str(cover)],
    )

    resume_state = state["fields"][upload._upload_field_key(resume_node)]
    cover_state = state["fields"][upload._upload_field_key(cover_node)]
    assert resume_state["status"] == "failed"
    assert resume_state["failures"] == 1
    assert cover_state["status"] == "accepted"
    assert cover_state["failures"] == 0


async def _async_value(value):
    return value
