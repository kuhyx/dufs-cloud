# Copyright (c) 2026 Krzysztof Rudnicki
"""Logging to the journal (stderr) and an append-only file, every run."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def setup_logging(log_file: Path) -> None:
    """Send INFO+ to stderr (journald under systemd) and append it to ``log_file``.

    The file outlives journal rotation, so "when did backups start failing?"
    stays answerable months later.
    """
    log_file.parent.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for handler in (logging.StreamHandler(), logging.FileHandler(log_file)):
        handler.setFormatter(logging.Formatter(_FORMAT))
        root.addHandler(handler)
