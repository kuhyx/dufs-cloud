# Copyright (c) 2026 Krzysztof Rudnicki
"""Raw RTDB REST access: whole-tree GET and per-namespace PUT.

crdt_sync's client speaks records, not raw trees, so this talks REST itself
and borrows only crdt_sync's token handling.

Every error message is scrubbed of the ID token first. ``requests`` puts the
full URL -- ``?auth=<token>`` included -- into its exception text, and those
messages end up in the journal, the log file and a committed prompt file.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import time
from typing import TYPE_CHECKING

import requests

from firebase_backup._errors import BackupError

if TYPE_CHECKING:
    from collections.abc import Callable

# Transient failures only (DNS not up yet after boot, a dropped connection).
# The timer fires right after boot when a run was missed, and the user
# manager cannot order itself after network-online.target, so the first
# attempt racing the network is the expected case, not an edge case.
_TIMEOUT_SECONDS = 120.0
_REDACTED = "<redacted>"


@dataclass(frozen=True)
class Retry:
    """How long to wait before each retry of a transient network failure."""

    delays: tuple[float, ...] = (15.0, 60.0, 180.0)
    sleep: Callable[[float], None] = time.sleep


def redact(text: str, secret: str) -> str:
    """Return ``text`` with every occurrence of ``secret`` replaced."""
    return text.replace(secret, _REDACTED) if secret else text


class RtdbClient:
    """GET/PUT JSON at a path of one database, authenticated per request."""

    def __init__(
        self,
        database_url: str,
        token: Callable[[], str],
        *,
        emulator_ns: str = "",
        session: requests.Session | None = None,
        retry: Retry | None = None,
    ) -> None:
        """Create a client for ``database_url`` using ``token()`` per request.

        Args:
            database_url: HTTPS origin, or the emulator's http://host:port.
            token: Returns a currently-valid ID token (``"owner"`` = emulator admin).
            emulator_ns: The emulator's namespace (``?ns=``); empty for production.
            session: HTTP session; tests inject a fake.
            retry: Backoff for transient failures; tests inject a no-op sleep.
        """
        self._base = database_url.rstrip("/")
        self._token = token
        self._emulator_ns = emulator_ns
        self._session = session if session is not None else requests.Session()
        self._retry = retry if retry is not None else Retry()

    def get(self, path: str = "") -> object:
        """Return the decoded JSON at ``path`` (``""`` = the whole database)."""
        response = self._send("GET", path, None)
        return response.json()

    def put(self, path: str, value: object) -> None:
        """Replace the value at ``path`` with ``value``."""
        if not path.strip("/"):
            # A root PUT would also delete every namespace created after the
            # snapshot. Restores go namespace by namespace, always.
            msg = "VERIFY refusing a root PUT; restore per namespace"
            raise BackupError(msg)
        self._send("PUT", path, json.dumps(value, separators=(",", ":")))

    def _send(self, method: str, path: str, body: str | None) -> requests.Response:
        token = self._token()
        params = {"auth": token}
        if self._emulator_ns:
            params["ns"] = self._emulator_ns
        url = f"{self._base}/{path.strip('/')}.json"
        attempt = 0
        while True:
            try:
                response = self._session.request(
                    method, url, params=params, data=body, timeout=_TIMEOUT_SECONDS
                )
            except (requests.ConnectionError, requests.Timeout) as exc:
                if attempt >= len(self._retry.delays):
                    detail = redact(str(exc), token)
                    msg = (
                        f"NETWORK {method} {url} failed after {attempt + 1} "
                        f"attempts: {detail}"
                    )
                    raise BackupError(msg) from None
                self._retry.sleep(self._retry.delays[attempt])
                attempt += 1
                continue
            if not response.ok:
                detail = redact(response.text[:500], token)
                msg = f"HTTP {method} {url} returned {response.status_code}: {detail}"
                raise BackupError(msg)
            return response
