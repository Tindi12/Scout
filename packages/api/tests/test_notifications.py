"""Tests for in-app notification service (CRUD + ownership)."""

from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

import pytest

# notification_service imports supabase at import time; stub before load.
sys.modules.setdefault(
    "core.supabase_client",
    MagicMock(supabase=MagicMock()),
)

from services import notification_service as ns


def _chain_mock(*, data=None, count=None):
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.is_.return_value = chain
    not_filter = MagicMock()
    not_filter.is_.return_value = chain
    chain.not_ = not_filter
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.update.return_value = chain
    chain.insert.return_value = chain
    chain.maybe_single.return_value = chain
    result = MagicMock()
    result.data = data
    result.count = count
    chain.execute.return_value = result
    return chain


@patch("services.notification_service.supabase")
def test_create_notification_inserts_when_no_active_row(mock_sb):
    existing = _chain_mock(data=[])
    insert_chain = _chain_mock(
        data=[
            {
                "id": "n1",
                "user_id": "u1",
                "type": "application_failed",
                "title": "Acme — SWE",
                "body": "timeout",
                "application_id": "a1",
                "scout_run_id": "r1",
                "read_at": None,
                "dismissed_at": None,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    mock_sb.table.side_effect = [existing, insert_chain]

    row = ns.create_notification(
        "u1",
        "application_failed",
        "Acme — SWE",
        body="timeout",
        application_id="a1",
        scout_run_id="r1",
    )

    assert row is not None
    assert row["id"] == "n1"
    assert row["type"] == "application_failed"


@patch("services.notification_service.supabase")
def test_create_notification_skips_duplicate_active(mock_sb):
    existing = _chain_mock(
        data=[
            {
                "id": "n-existing",
                "user_id": "u1",
                "type": "application_failed",
                "title": "Acme — SWE",
                "body": None,
                "application_id": "a1",
                "scout_run_id": None,
                "read_at": None,
                "dismissed_at": None,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    mock_sb.table.return_value = existing

    row = ns.create_notification(
        "u1",
        "application_failed",
        "Acme — SWE",
        application_id="a1",
    )

    assert row is not None
    assert row["id"] == "n-existing"
    assert mock_sb.table.call_count == 1


@patch("services.notification_service.supabase")
def test_list_notifications_excludes_dismissed(mock_sb):
    list_chain = _chain_mock(
        data=[
            {
                "id": "n1",
                "user_id": "u1",
                "type": "application_applied",
                "title": "Done",
                "body": None,
                "application_id": "a1",
                "scout_run_id": None,
                "read_at": None,
                "dismissed_at": None,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    mock_sb.table.return_value = list_chain

    items = ns.list_notifications("u1")

    assert len(items) == 1
    list_chain.is_.assert_called_with("dismissed_at", "null")


@patch("services.notification_service.supabase")
def test_unread_count(mock_sb):
    count_chain = _chain_mock(count=3)
    mock_sb.table.return_value = count_chain

    assert ns.unread_count("u1") == 3


@patch("services.notification_service.supabase")
def test_mark_read_requires_ownership(mock_sb):
    owned = _chain_mock(data={"id": "n1", "user_id": "u1", "read_at": None, "dismissed_at": None})
    update_chain = _chain_mock(data=[{"id": "n1"}])
    mock_sb.table.side_effect = [owned, update_chain]

    assert ns.mark_read("u1", "n1") is True


@patch("services.notification_service.supabase")
def test_mark_read_not_found(mock_sb):
    owned = _chain_mock(data=None)
    mock_sb.table.return_value = owned

    assert ns.mark_read("u1", "missing") is False


@patch("services.notification_service.supabase")
def test_dismiss_sets_read_and_dismissed(mock_sb):
    owned = _chain_mock(
        data={"id": "n1", "user_id": "u1", "read_at": None, "dismissed_at": None}
    )
    update_chain = _chain_mock(data=[{"id": "n1"}])
    mock_sb.table.side_effect = [owned, update_chain]

    assert ns.dismiss("u1", "n1") is True
    update_payload = update_chain.update.call_args[0][0]
    assert "dismissed_at" in update_payload
    assert "read_at" in update_payload


@patch("services.notification_service.supabase")
def test_dismiss_wrong_user_returns_false(mock_sb):
    owned = _chain_mock(data=None)
    mock_sb.table.return_value = owned

    assert ns.dismiss("u2", "n1") is False


@patch("services.notification_service.supabase")
def test_dismissed_application_ids(mock_sb):
    chain = _chain_mock(
        data=[{"application_id": "a1"}, {"application_id": "a2"}]
    )
    mock_sb.table.return_value = chain

    ids = ns.dismissed_application_ids("u1")

    assert ids == ["a1", "a2"]


def test_create_notification_rejects_invalid_type():
    with pytest.raises(ValueError, match="invalid notification type"):
        ns.create_notification("u1", "not_a_real_type", "title")
