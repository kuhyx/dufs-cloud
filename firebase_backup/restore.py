# Copyright (c) 2026 Krzysztof Rudnicki
"""Restore namespaces from a snapshot. Dry run unless ``--yes``.

::

    python3 -m firebase_backup.restore latest                    # what would change
    python3 -m firebase_backup.restore latest --namespace todo-sync --yes
    python3 -m firebase_backup.restore ~/data/cloud/firebase_backups/<file> --yes

Safety, in order:

1. A dry run is the default: it prints, per namespace, whether live data
   matches the snapshot, differs, or is missing.
2. With ``--yes`` a fresh ``-pre-restore`` snapshot of the live database is
   written first, so a restore is itself undoable.
3. Each namespace is PUT on its own. Namespaces that exist live but not in
   the snapshot are left untouched (a root PUT would delete them).
4. Every restored namespace is read back and compared; a mismatch fails.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
from pathlib import Path
import sys
from typing import TYPE_CHECKING

from firebase_backup import _paths
from firebase_backup._archive import latest_snapshot, read_snapshot, write_snapshot
from firebase_backup._errors import BackupError
from firebase_backup._log import setup_logging
from firebase_backup.backup import build_parser, client_and_project

if TYPE_CHECKING:
    import argparse

    from firebase_backup._rtdb import RtdbClient

_logger = logging.getLogger("firebase_backup.restore")


def _size(value: object) -> int:
    return len(json.dumps(value, separators=(",", ":")))


def plan(
    snapshot: dict[str, object], live: dict[str, object], names: list[str]
) -> list[str]:
    """Return one human-readable line per namespace describing the change."""
    lines = []
    for name in names:
        if name not in live:
            state = "MISSING live -> would recreate"
        elif live[name] == snapshot[name]:
            state = "same -> no change"
        else:
            state = "DIFFERS -> would overwrite live"
        lines.append(
            f"{name:<28} snapshot {_size(snapshot[name]):>10} B  "
            f"live {_size(live.get(name)) if name in live else 0:>10} B  {state}"
        )
    lines.extend(
        f"{name:<28} live-only -> left untouched"
        for name in sorted(set(live) - set(snapshot))
    )
    return lines


def apply(client: RtdbClient, snapshot: dict[str, object], names: list[str]) -> None:
    """PUT each namespace in ``names`` from ``snapshot`` and verify by reading back.

    Raises:
        BackupError: ``VERIFY`` if a namespace reads back different from what was put.
    """
    for name in names:
        client.put(name, snapshot[name])
        if client.get(name) != snapshot[name]:
            msg = f"VERIFY {name} read back different from the snapshot after PUT"
            raise BackupError(msg)
        _logger.info("RESTORED %s", name)


def _resolve(source: str, backup_dir: Path, project_id: str) -> Path:
    if source != "latest":
        return Path(source).expanduser()
    path = latest_snapshot(backup_dir, project_id)
    if path is None:
        msg = f"VERIFY no snapshot of {project_id} in {backup_dir}"
        raise BackupError(msg)
    return path


def _run(args: argparse.Namespace) -> None:
    backup_dir = args.backup_dir or _paths.BACKUP_DIR
    client, project_id = client_and_project(args)
    path = _resolve(args.snapshot, backup_dir, project_id)
    snapshot = read_snapshot(path)
    names = args.namespace or sorted(snapshot)
    unknown = sorted(set(names) - set(snapshot))
    if unknown:
        msg = f"VERIFY not in {path.name}: {', '.join(unknown)}"
        raise BackupError(msg)
    live = client.get() or {}
    if not isinstance(live, dict):
        msg = f"VERIFY live database root is {type(live).__name__}, not an object"
        raise BackupError(msg)
    _logger.info("snapshot %s", path)
    for line in plan(snapshot, live, names):
        _logger.info("  %s", line)
    if not args.yes:
        _logger.info("dry run: nothing written. Re-run with --yes to restore.")
        return
    changed = [name for name in names if live.get(name) != snapshot[name]]
    if live:
        # From the tree just read, not a re-export: a fully wiped database is
        # exactly when a restore matters, and there is nothing to save then.
        now = dt.datetime.now(dt.UTC)
        safety = write_snapshot(backup_dir, project_id, live, now, "pre-restore")
        _logger.info("pre-restore snapshot %s", safety.path)
    apply(client, snapshot, changed)
    _logger.info(
        "restore complete: %d changed of %d namespace(s) from %s",
        len(changed),
        len(names),
        path.name,
    )


def _attempt(args: argparse.Namespace) -> BackupError | None:
    try:
        _run(args)
    except BackupError as exc:
        return exc
    return None


def main(argv: list[str] | None = None) -> int:
    """Run the restore CLI. Returns 0 on success, 1 on a reported failure."""
    parser = build_parser()
    parser.description = "Restore namespaces from a snapshot (dry run unless --yes)."
    parser.add_argument("snapshot", help="Snapshot file, or 'latest'.")
    parser.add_argument(
        "--namespace", action="append", help="Restore only this namespace; repeatable."
    )
    parser.add_argument("--yes", action="store_true", help="Actually write.")
    args = parser.parse_args(argv)
    setup_logging(args.log_file or _paths.LOG_FILE)
    error = _attempt(args)
    if error is not None:
        _logger.error("RESTORE FAILED %s", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
