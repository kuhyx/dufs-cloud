# Copyright (c) 2026 Krzysztof Rudnicki
"""Snapshot files: atomic gzip writes, owner-only permissions, newest-first lookup.

Names are ``<project>-<UTC timestamp>[-<tag>].json.gz``. A full timestamp
rather than a date so a same-day rerun, or a pre-restore safety snapshot,
adds a file instead of replacing one -- every snapshot is kept forever.
"""

from __future__ import annotations

from dataclasses import dataclass
import gzip
import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import TYPE_CHECKING

from firebase_backup._errors import BackupError

if TYPE_CHECKING:
    import datetime as dt

_SUFFIX = ".json.gz"
_DIR_MODE = 0o700
_FILE_MODE = 0o600


@dataclass(frozen=True)
class Snapshot:
    """A written snapshot and the facts the run log records about it."""

    path: Path
    size_bytes: int
    sha256: str
    namespaces: tuple[str, ...]


def snapshot_name(project_id: str, now: dt.datetime, tag: str = "") -> str:
    """Return the file name for a snapshot of ``project_id`` taken at ``now``."""
    stamp = now.strftime("%Y-%m-%dT%H%M%SZ")
    return f"{project_id}-{stamp}{f'-{tag}' if tag else ''}{_SUFFIX}"


def write_snapshot(
    directory: Path,
    project_id: str,
    data: dict[str, object],
    now: dt.datetime,
    tag: str = "",
) -> Snapshot:
    """Write ``data`` gzipped under ``directory`` atomically and return its facts.

    Temp file in the same directory, fsync, then rename: a crash or a full
    disk leaves either the old set of files or the new one, never a
    truncated snapshot that looks like a backup.
    """
    directory.mkdir(parents=True, exist_ok=True)
    directory.chmod(_DIR_MODE)
    payload = gzip.compress(
        json.dumps(data, ensure_ascii=False, sort_keys=True).encode(), mtime=0
    )
    target = directory / snapshot_name(project_id, now, tag)
    if target.exists():
        msg = f"VERIFY {target} already exists; refusing to overwrite a snapshot"
        raise BackupError(msg)
    fd, tmp_name = tempfile.mkstemp(dir=directory, prefix=".partial-", suffix=_SUFFIX)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        tmp.chmod(_FILE_MODE)
        tmp.rename(target)
    finally:
        tmp.unlink(missing_ok=True)
    return Snapshot(
        path=target,
        size_bytes=len(payload),
        sha256=hashlib.sha256(payload).hexdigest(),
        namespaces=tuple(sorted(data)),
    )


def list_snapshots(directory: Path, project_id: str) -> list[Path]:
    """Return every snapshot of ``project_id`` in ``directory``, oldest first."""
    if not directory.is_dir():
        return []
    return sorted(directory.glob(f"{project_id}-*{_SUFFIX}"))


def latest_snapshot(directory: Path, project_id: str) -> Path | None:
    """Return the newest snapshot of ``project_id``, or ``None`` if there is none."""
    snapshots = list_snapshots(directory, project_id)
    return snapshots[-1] if snapshots else None


def read_snapshot(path: Path) -> dict[str, object]:
    """Return the decoded tree stored in ``path``.

    Raises:
        BackupError: ``VERIFY`` if the file is unreadable or not a JSON object.
    """
    try:
        data = json.loads(gzip.decompress(path.read_bytes()))
    except (OSError, EOFError, ValueError) as exc:
        msg = f"VERIFY cannot read snapshot {path}: {exc}"
        raise BackupError(msg) from None
    if not isinstance(data, dict):
        msg = f"VERIFY snapshot {path} is not a JSON object"
        raise BackupError(msg)
    return data
