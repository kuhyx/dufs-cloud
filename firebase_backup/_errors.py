# Copyright (c) 2026 Krzysztof Rudnicki
"""The one exception type the CLIs turn into a non-zero exit."""

from __future__ import annotations


class BackupError(Exception):
    """A backup or restore could not complete; the message says why and what next.

    The first word of every message is a stable class tag (``NO_SESSION``,
    ``AUTH``, ``NETWORK``, ``HTTP``, ``EMPTY``, ``SHRINK``, ``VERIFY``) that
    the OnFailure handler greps to pick the right fix instructions.
    """
