# Copyright (c) 2026 Krzysztof Rudnicki
"""Restore: dry run, per-namespace writes, safety snapshot, verification."""

from __future__ import annotations

import datetime as dt
import runpy
import sys
from typing import TYPE_CHECKING

import pytest

from firebase_backup import _paths, backup, restore
from firebase_backup._archive import list_snapshots, read_snapshot, write_snapshot
from firebase_backup._errors import BackupError
from firebase_backup.tests.conftest import FakeClient

if TYPE_CHECKING:
    from pathlib import Path

NOW = dt.datetime(2026, 9, 25, tzinfo=dt.UTC)
SNAP = {"todo-sync": {"r1": {"t": "milk"}}, "diet-guard-sync": {"x": 1}, "same": 1}


@pytest.fixture
def snap_path() -> Path:
    return write_snapshot(_paths.BACKUP_DIR, "ns1", SNAP, NOW).path


def run(monkeypatch: pytest.MonkeyPatch, client: FakeClient, *argv: str) -> int:
    monkeypatch.setattr(restore, "client_and_project", lambda _args: (client, "ns1"))
    return restore.main(list(argv))


def log() -> str:
    return _paths.LOG_FILE.read_text()


def test_plan_describes_every_case() -> None:
    live = {"todo-sync": {"r1": "changed"}, "same": 1, "extra": 2}
    lines = restore.plan(SNAP, live, ["diet-guard-sync", "same", "todo-sync"])
    assert "MISSING live -> would recreate" in lines[0]
    assert "same -> no change" in lines[1]
    assert "DIFFERS -> would overwrite live" in lines[2]
    assert lines[3].startswith("extra")
    assert "left untouched" in lines[3]


@pytest.mark.usefixtures("snap_path")
def test_dry_run_writes_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient({"todo-sync": {"r1": "changed"}, "same": 1})
    assert run(monkeypatch, client, "latest") == 0
    assert client.puts == []
    assert len(list_snapshots(_paths.BACKUP_DIR, "ns1")) == 1
    assert "dry run: nothing written" in log()


def test_yes_restores_changed_only_after_safety_snapshot(
    monkeypatch: pytest.MonkeyPatch, snap_path: Path
) -> None:
    live = {"todo-sync": {"r1": "changed"}, "same": 1, "extra": 2}
    client = FakeClient(dict(live))
    assert run(monkeypatch, client, str(snap_path), "--yes") == 0
    assert sorted(client.puts) == ["diet-guard-sync", "todo-sync"]
    assert client.tree == {**SNAP, "extra": 2}
    safety = list_snapshots(_paths.BACKUP_DIR, "ns1")[-1]
    assert safety.name.endswith("-pre-restore.json.gz")
    assert read_snapshot(safety) == live
    assert "restore complete: 2 changed of 3" in log()


@pytest.mark.usefixtures("snap_path")
def test_restore_into_wiped_database_skips_safety_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient(None)
    assert run(monkeypatch, client, "latest", "--namespace", "same", "--yes") == 0
    assert client.tree == {"same": 1}
    assert len(list_snapshots(_paths.BACKUP_DIR, "ns1")) == 1


@pytest.mark.usefixtures("snap_path")
def test_readback_mismatch_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient({"same": 1})
    client.corrupt_on_put.add("todo-sync")
    assert run(monkeypatch, client, "latest", "--yes") == 1
    assert "RESTORE FAILED VERIFY todo-sync read back different" in log()


@pytest.mark.usefixtures("snap_path")
def test_unknown_namespace_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert run(monkeypatch, FakeClient({}), "latest", "--namespace", "nope") == 1
    assert "not in" in log()


def test_no_snapshot_for_latest(monkeypatch: pytest.MonkeyPatch) -> None:
    assert run(monkeypatch, FakeClient({}), "latest") == 1
    assert "no snapshot of ns1" in log()


@pytest.mark.usefixtures("snap_path")
def test_live_root_not_object_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert run(monkeypatch, FakeClient([1]), "latest") == 1
    assert "live database root is list" in log()


def test_explicit_path_with_tilde(
    monkeypatch: pytest.MonkeyPatch, snap_path: Path
) -> None:
    monkeypatch.setenv("HOME", str(snap_path.parent))
    assert run(monkeypatch, FakeClient({}), f"~/{snap_path.name}") == 0


def test_apply_raises_on_mismatch() -> None:
    client = FakeClient({})
    client.corrupt_on_put.add("a")
    with pytest.raises(BackupError, match=r"^VERIFY a read back"):
        restore.apply(client, {"a": 1}, ["a"])


@pytest.mark.usefixtures("snap_path")
def test_module_entry_point(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeClient(dict(SNAP))
    # restore imports client_and_project from the already-loaded backup module.
    monkeypatch.setattr(backup, "RtdbClient", lambda *_a, **_k: fake)
    monkeypatch.setattr("sys.argv", ["restore", "latest", "--emulator-ns", "ns1"])
    # Fresh execution as __main__, not a re-run of the cached module object.
    monkeypatch.delitem(sys.modules, "firebase_backup.restore")
    with pytest.raises(SystemExit) as caught:
        runpy.run_module("firebase_backup.restore", run_name="__main__", alter_sys=True)
    assert caught.value.code == 0
