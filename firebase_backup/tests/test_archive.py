# Copyright (c) 2026 Krzysztof Rudnicki
"""Snapshot naming, atomic writes, permissions, lookup and reading."""

from __future__ import annotations

import datetime as dt
import gzip
import hashlib
from typing import TYPE_CHECKING

import pytest

from firebase_backup import _archive
from firebase_backup._archive import (
    latest_snapshot,
    list_snapshots,
    read_snapshot,
    snapshot_name,
    write_snapshot,
)
from firebase_backup._errors import BackupError

if TYPE_CHECKING:
    from pathlib import Path

OWNER_ONLY_DIR = 0o700
OWNER_ONLY_FILE = 0o600
NOW = dt.datetime(2026, 9, 26, 14, 30, 5, tzinfo=dt.UTC)


def test_snapshot_name_with_and_without_tag() -> None:
    assert snapshot_name("p", NOW) == "p-2026-09-26T143005Z.json.gz"
    assert snapshot_name("p", NOW, "pre-restore") == (
        "p-2026-09-26T143005Z-pre-restore.json.gz"
    )


def test_write_snapshot_round_trips_with_owner_only_modes(tmp_path: Path) -> None:
    directory = tmp_path / "snaps"
    snap = write_snapshot(directory, "p", {"b": 1, "a": {"é": 2}}, NOW)
    assert snap.path == directory / "p-2026-09-26T143005Z.json.gz"
    assert snap.namespaces == ("a", "b")
    raw = snap.path.read_bytes()
    assert snap.size_bytes == len(raw)
    assert snap.sha256 == hashlib.sha256(raw).hexdigest()
    assert read_snapshot(snap.path) == {"a": {"é": 2}, "b": 1}
    assert directory.stat().st_mode & 0o777 == OWNER_ONLY_DIR
    assert snap.path.stat().st_mode & 0o777 == OWNER_ONLY_FILE
    assert [p.name for p in directory.iterdir()] == [snap.path.name]


def test_write_snapshot_refuses_to_overwrite(tmp_path: Path) -> None:
    write_snapshot(tmp_path, "p", {"a": 1}, NOW)
    with pytest.raises(BackupError, match=r"^VERIFY .* already exists"):
        write_snapshot(tmp_path, "p", {"a": 2}, NOW)
    assert read_snapshot(tmp_path / snapshot_name("p", NOW)) == {"a": 1}


def test_failed_write_leaves_no_partial_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(_fd: int) -> None:
        msg = "disk full"
        raise OSError(msg)

    monkeypatch.setattr(_archive.os, "fsync", boom)
    with pytest.raises(OSError, match=r"disk full"):
        write_snapshot(tmp_path, "p", {"a": 1}, NOW)
    assert list(tmp_path.iterdir()) == []


def test_list_and_latest(tmp_path: Path) -> None:
    assert list_snapshots(tmp_path / "missing", "p") == []
    assert latest_snapshot(tmp_path, "p") is None
    later = NOW + dt.timedelta(days=1)
    write_snapshot(tmp_path, "p", {"a": 1}, later)
    write_snapshot(tmp_path, "p", {"a": 1}, NOW)
    write_snapshot(tmp_path, "other", {"a": 1}, later + dt.timedelta(days=1))
    assert [p.name for p in list_snapshots(tmp_path, "p")] == [
        snapshot_name("p", NOW),
        snapshot_name("p", later),
    ]
    assert latest_snapshot(tmp_path, "p") == tmp_path / snapshot_name("p", later)


@pytest.mark.parametrize(
    ("payload", "match"),
    [
        (b"not gzip", "cannot read"),
        (gzip.compress(b"{broken"), "cannot read"),
        (gzip.compress(b"[1, 2]"), "not a JSON object"),
    ],
)
def test_read_snapshot_rejects_bad_files(
    tmp_path: Path, payload: bytes, match: str
) -> None:
    path = tmp_path / "bad.json.gz"
    path.write_bytes(payload)
    with pytest.raises(BackupError, match=rf"^VERIFY .*{match}"):
        read_snapshot(path)


def test_read_snapshot_missing_file(tmp_path: Path) -> None:
    with pytest.raises(BackupError, match=r"^VERIFY cannot read"):
        read_snapshot(tmp_path / "nope.json.gz")
