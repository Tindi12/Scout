"""Tests for the stale-application reaper (tasks.job_tasks).

The reaper is the backstop that reconciles applications a hard worker death
(OOM/deploy/SIGKILL/lost Browserbase session) stranded in a non-terminal state
and closes the scout_runs they held open — otherwise the tracker shows a dead
run as "APPLYING" forever.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from tasks import job_tasks


def _update_chain(*, data):
    """Mock supabase.table(...).update(...).eq().eq().eq().execute() -> data."""
    chain = MagicMock()
    chain.update.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.in_.return_value = chain
    chain.lt.return_value = chain
    chain.limit.return_value = chain
    chain.maybe_single.return_value = chain
    result = MagicMock()
    result.data = data
    chain.execute.return_value = result
    return chain


@patch("tasks.job_tasks.notify_application")
@patch("tasks.job_tasks.refund_application_credits")
def test_reap_flips_refunds_and_counts_when_transition_wins(mock_refund, mock_notify):
    """A stranded row we actually flip is failed once, refunded, and counted."""
    app = {
        "id": "app-1",
        "user_id": "user-1",
        "scout_run_id": "run-1",
        "status": "in_progress",
    }
    mock_sb = MagicMock()
    mock_sb.table.return_value = _update_chain(data=[{"id": "app-1"}])
    mock_sb.rpc.return_value.execute.return_value = MagicMock()

    with patch("tasks.job_tasks.supabase", mock_sb):
        flipped = job_tasks._reap_stale_application(app)

    assert flipped is True
    mock_refund.assert_called_once_with("user-1")
    # failed_count bumped for the run.
    mock_sb.rpc.assert_called_once()
    assert mock_sb.rpc.call_args[0][0] == "increment_scout_run_counter"
    assert mock_sb.rpc.call_args[0][1]["counter_name"] == "failed_count"
    mock_notify.assert_called_once()


@patch("tasks.job_tasks.notify_application")
@patch("tasks.job_tasks.refund_application_credits")
def test_reap_is_noop_when_row_already_finished(mock_refund, mock_notify):
    """If a real worker finished the attempt between select and update, the
    guarded flip matches no row — no refund, no counter, no notification."""
    app = {
        "id": "app-1",
        "user_id": "user-1",
        "scout_run_id": "run-1",
        "status": "in_progress",
    }
    mock_sb = MagicMock()
    mock_sb.table.return_value = _update_chain(data=[])  # lost the race

    with patch("tasks.job_tasks.supabase", mock_sb):
        flipped = job_tasks._reap_stale_application(app)

    assert flipped is False
    mock_refund.assert_not_called()
    mock_sb.rpc.assert_not_called()
    mock_notify.assert_not_called()


@patch("tasks.job_tasks._finalize_lingering_runs", return_value=0)
@patch("tasks.job_tasks.finalize_run_if_complete")
def test_task_aggregates_and_finalizes_affected_runs(mock_finalize, _mock_linger):
    """The task reaps every stale row and finalizes each affected run once."""
    active_rows = [
        {"id": "a1", "user_id": "u1", "scout_run_id": "run-1", "status": "in_progress"},
        {"id": "a2", "user_id": "u1", "scout_run_id": "run-1", "status": "awaiting_code"},
    ]
    queued_rows = [
        {"id": "a3", "user_id": "u1", "scout_run_id": "run-2", "status": "queued"},
    ]

    # supabase.table("applications").select(...).in_/eq(...).lt(...).limit(...).execute()
    # is called twice (active then queued); return the two batches in order.
    select_active = _update_chain(data=active_rows)
    select_queued = _update_chain(data=queued_rows)
    mock_sb = MagicMock()
    mock_sb.table.side_effect = [select_active, select_queued]

    with patch("tasks.job_tasks.supabase", mock_sb), patch(
        "tasks.job_tasks._reap_stale_application", return_value=True
    ) as mock_reap:
        result = job_tasks.reap_stale_applications_task()

    assert mock_reap.call_count == 3
    assert result["reaped"] == 3
    # run-1 and run-2 each finalized exactly once (deduped set).
    finalized_runs = {c.args[0] for c in mock_finalize.call_args_list}
    assert finalized_runs == {"run-1", "run-2"}
    assert mock_finalize.call_count == 2
