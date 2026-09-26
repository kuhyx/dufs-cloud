# Copyright (c) 2026 Krzysztof Rudnicki
"""Export the whole RTDB into a timestamped snapshot, gated against silent loss.

What the systemd timer runs::

    python3 -m firebase_backup.backup

A run only succeeds when the export is a non-empty JSON object holding every
namespace the newest previous snapshot held. A namespace that vanished is
written anyway (the current state is still worth keeping) and then fails the
run, so a wiped app surfaces the same day instead of being archived quietly.
"""

from __future__ import annotations

import argparse
import datetime as dt
import logging
from pathlib import Path
import sys

from firebase_backup import _paths
from firebase_backup._archive import (
    Snapshot,
    latest_snapshot,
    read_snapshot,
    write_snapshot,
)
from firebase_backup._auth import load_config, session_token
from firebase_backup._errors import BackupError
from firebase_backup._log import setup_logging
from firebase_backup._rtdb import RtdbClient

_logger = logging.getLogger("firebase_backup")


def export_tree(client: RtdbClient) -> dict[str, object]:
    """Return the whole database as a JSON object.

    Raises:
        BackupError: ``EMPTY`` if the database returned null or a non-object.
    """
    data = client.get()
    if not isinstance(data, dict) or not data:
        msg = f"EMPTY the database export was {type(data).__name__} {data!r:.80}"
        raise BackupError(msg)
    return data


def run_backup(
    client: RtdbClient,
    backup_dir: Path,
    project_id: str,
    now: dt.datetime,
    tag: str = "",
) -> Snapshot:
    """Export, compare against the newest snapshot, write, and return the result.

    Raises:
        BackupError: On any failure; ``SHRINK`` after writing, if namespaces vanished.
    """
    data = export_tree(client)
    previous = latest_snapshot(backup_dir, project_id)
    previous_names = set(read_snapshot(previous)) if previous else set()
    snapshot = write_snapshot(backup_dir, project_id, data, now, tag)
    _logger.info(
        "OK wrote %s (%d bytes, sha256 %s) namespaces=%s",
        snapshot.path,
        snapshot.size_bytes,
        snapshot.sha256,
        ",".join(snapshot.namespaces),
    )
    missing = sorted(previous_names - set(data))
    if missing:
        msg = (
            f"SHRINK namespaces present in {previous} are gone from the live "
            f"database: {', '.join(missing)}. The new snapshot was still "
            f"written; the older one still holds the data."
        )
        raise BackupError(msg)
    return snapshot


def build_parser() -> argparse.ArgumentParser:
    """Return the CLI shared by backup and restore for target selection."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument(
        "--backup-dir", type=Path, default=None, help="Snapshot directory."
    )
    parser.add_argument(
        "--log-file", type=Path, default=None, help="Run log (appended)."
    )
    parser.add_argument(
        "--database-url",
        default="",
        help="Override the database origin, e.g. http://127.0.0.1:9000 (emulator).",
    )
    parser.add_argument(
        "--emulator-ns",
        default="",
        help="Talk to the RTDB emulator with this ?ns= and its admin token.",
    )
    return parser


def client_and_project(args: argparse.Namespace) -> tuple[RtdbClient, str]:
    """Return the client and project id ``args`` select (production by default)."""
    if args.emulator_ns:
        url = args.database_url or "http://127.0.0.1:9000"
        return RtdbClient(url, lambda: "owner", emulator_ns=args.emulator_ns), (
            args.emulator_ns
        )
    config = load_config()
    url = args.database_url or config.database_url
    return RtdbClient(url, session_token(config)), config.project_id


def _attempt(args: argparse.Namespace, backup_dir: Path) -> BackupError | None:
    try:
        client, project_id = client_and_project(args)
        run_backup(client, backup_dir, project_id, dt.datetime.now(dt.UTC))
    except BackupError as exc:
        return exc
    return None


def main(argv: list[str] | None = None) -> int:
    """Run one backup. Returns 0 on success, 1 on any failure (logged loudly).

    Anything other than a ``BackupError`` is a bug and propagates with its
    traceback; systemd's OnFailure handler catches that case too.
    """
    args = build_parser().parse_args(argv)
    setup_logging(args.log_file or _paths.LOG_FILE)
    error = _attempt(args, args.backup_dir or _paths.BACKUP_DIR)
    if error is not None:
        _logger.error("FAILED %s", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
