# Copyright (c) 2026 Krzysztof Rudnicki
"""Backup: export gate, shrink gate, CLI wiring and exit codes."""

from __future__ import annotations

import datetime as dt
import runpy
import sys
from typing import TYPE_CHECKING

import pytest

from firebase_backup import _paths, _rtdb, backup
from firebase_backup._archive import latest_snapshot, read_snapshot, write_snapshot
from firebase_backup._errors import BackupError
from firebase_backup.tests.conftest import FakeClient
from firebase_backup.tests.test_auth import CONFIG

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

NOW = dt.datetime(2026, 9, 26, 0, 0, tzinfo=dt.UTC)


@pytest.mark.parametrize("tree", [None, {}, [1], "x"])
def test_export_rejects_empty_or_non_object(tree: object) -> None:
    with pytest.raises(BackupError, match=r"^EMPTY "):
        backup.export_tree(FakeClient(tree))


def test_first_backup_writes_snapshot(fake_client: FakeClient, tmp_path: Path) -> None:
    snap = backup.run_backup(fake_client, tmp_path, "p", NOW)
    assert read_snapshot(snap.path) == fake_client.tree
    assert snap.namespaces == ("diet-guard-sync", "todo-sync")


def test_growing_database_passes(fake_client: FakeClient, tmp_path: Path) -> None:
    write_snapshot(tmp_path, "p", {"todo-sync": {}}, NOW)
    backup.run_backup(fake_client, tmp_path, "p", NOW + dt.timedelta(days=1))


def test_vanished_namespace_is_written_then_fails(
    fake_client: FakeClient, tmp_path: Path
) -> None:
    write_snapshot(tmp_path, "p", {"todo-sync": {}, "gone": 1, "also-gone": 2}, NOW)
    later = NOW + dt.timedelta(days=1)
    with pytest.raises(BackupError, match=r"^SHRINK .*also-gone, gone"):
        backup.run_backup(fake_client, tmp_path, "p", later)
    newest = latest_snapshot(tmp_path, "p")
    assert newest is not None
    assert read_snapshot(newest) == fake_client.tree


def run_main(
    monkeypatch: pytest.MonkeyPatch, client: FakeClient, argv: list[str]
) -> tuple[int, list[tuple[str, str]]]:
    made: list[tuple[str, str]] = []

    def factory(url: str, token: Callable[[], str], **_kwargs: str) -> FakeClient:
        made.append((url, token()))
        return client

    monkeypatch.setattr(backup, "RtdbClient", factory)
    return backup.main(argv), made


def test_main_production_path(
    monkeypatch: pytest.MonkeyPatch, fake_client: FakeClient
) -> None:
    monkeypatch.setattr(backup, "load_config", lambda: CONFIG)
    monkeypatch.setattr(backup, "session_token", lambda _config: lambda: "tok")
    code, made = run_main(monkeypatch, fake_client, [])
    assert code == 0
    assert made == [("https://db.example", "tok")]
    assert latest_snapshot(_paths.BACKUP_DIR, "kuhy-syncs") is not None
    assert "OK wrote" in _paths.LOG_FILE.read_text()


def test_main_emulator_path_and_overrides(
    monkeypatch: pytest.MonkeyPatch, fake_client: FakeClient, tmp_path: Path
) -> None:
    log = tmp_path / "other.log"
    argv = [
        "--emulator-ns",
        "ns1",
        "--backup-dir",
        str(tmp_path / "b"),
        "--log-file",
        str(log),
    ]
    code, made = run_main(monkeypatch, fake_client, argv)
    assert code == 0
    assert made == [("http://127.0.0.1:9000", "owner")]
    assert latest_snapshot(tmp_path / "b", "ns1") is not None
    assert "OK wrote" in log.read_text()
    assert not _paths.LOG_FILE.exists()


def test_main_database_url_override(
    monkeypatch: pytest.MonkeyPatch, fake_client: FakeClient
) -> None:
    monkeypatch.setattr(backup, "load_config", lambda: CONFIG)
    monkeypatch.setattr(backup, "session_token", lambda _config: lambda: "tok")
    _, made = run_main(monkeypatch, fake_client, ["--database-url", "https://alt"])
    assert made == [("https://alt", "tok")]


def test_main_failure_logs_and_returns_1(monkeypatch: pytest.MonkeyPatch) -> None:
    code, _ = run_main(monkeypatch, FakeClient(None), ["--emulator-ns", "ns1"])
    assert code == 1
    assert "FAILED EMPTY" in _paths.LOG_FILE.read_text()


def test_module_entry_point_exits_with_main_status(
    monkeypatch: pytest.MonkeyPatch, fake_client: FakeClient
) -> None:
    monkeypatch.setattr(_rtdb, "RtdbClient", lambda *_a, **_k: fake_client)
    monkeypatch.setattr("sys.argv", ["backup", "--emulator-ns", "ns1"])
    # Fresh execution as __main__, not a re-run of the cached module object.
    monkeypatch.delitem(sys.modules, "firebase_backup.backup")
    with pytest.raises(SystemExit) as caught:
        runpy.run_module("firebase_backup.backup", run_name="__main__", alter_sys=True)
    assert caught.value.code == 0
