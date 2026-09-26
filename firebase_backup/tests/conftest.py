# Copyright (c) 2026 Krzysztof Rudnicki
"""Shared fixtures. Every on-disk path the package knows is redirected here."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import pytest

from firebase_backup import _paths
from firebase_backup._errors import BackupError

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


@pytest.fixture(autouse=True)
def _isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Point HOME, the snapshot dir, the log and state dir into ``tmp_path``.

    HOME too, because crdt_sync.credential_store_for resolves
    ~/.config/<app>/ at call time -- a test must never read or write the
    live session, the live backups, or the live log.
    """
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setattr(_paths, "BACKUP_DIR", tmp_path / "backups")
    monkeypatch.setattr(_paths, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(_paths, "LOG_FILE", tmp_path / "state" / "backup.log")
    root = logging.getLogger()
    before = list(root.handlers)
    yield
    for handler in root.handlers[len(before) :]:
        handler.close()
    root.handlers[:] = before


class FakeClient:
    """In-memory stand-in for RtdbClient over a plain dict tree."""

    def __init__(self, tree: object) -> None:
        self.tree = tree
        self.puts: list[str] = []
        self.corrupt_on_put: set[str] = set()

    def get(self, path: str = "") -> object:
        if not path:
            return self.tree
        return self.tree.get(path) if isinstance(self.tree, dict) else None

    def put(self, path: str, value: object) -> None:
        if not path:
            msg = "VERIFY refusing a root PUT"
            raise BackupError(msg)
        if not isinstance(self.tree, dict):
            self.tree = {}  # a PUT into a wiped (null) database creates the root
        self.puts.append(path)
        self.tree[path] = "garbage" if path in self.corrupt_on_put else value


@pytest.fixture
def fake_client() -> FakeClient:
    """A database holding two namespaces."""
    return FakeClient({"todo-sync": {"r1": {"t": "milk"}}, "diet-guard-sync": {"x": 1}})
