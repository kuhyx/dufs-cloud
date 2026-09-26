# Copyright (c) 2026 Krzysztof Rudnicki
"""RtdbClient: URLs, params, retries, token redaction, root-PUT refusal."""

from __future__ import annotations

from http import HTTPStatus
import json

import pytest
import requests

from firebase_backup import _rtdb
from firebase_backup._errors import BackupError
from firebase_backup._rtdb import Retry, RtdbClient, redact

JWT = "eyJ.secret-value.sig"


class FakeResponse:
    def __init__(self, status: int, body: str) -> None:
        self.status_code = status
        self.ok = status < HTTPStatus.BAD_REQUEST
        self.text = body

    def json(self) -> object:
        return json.loads(self.text)


class FakeSession:
    """Replays a scripted list of responses or exceptions."""

    def __init__(self, *outcomes: FakeResponse | Exception) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[tuple[str, str, dict[str, str], str | None]] = []
        self.timeouts: list[float] = []

    def request(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, str],
        data: str | None,
        timeout: float,
    ) -> FakeResponse:
        self.calls.append((method, url, dict(params), data))
        self.timeouts.append(timeout)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def make(
    session: FakeSession, sleeps: list[float], emulator_ns: str = ""
) -> RtdbClient:
    return RtdbClient(
        "https://db.example/",
        lambda: JWT,
        session=session,
        retry=Retry(delays=(1.0, 2.0), sleep=sleeps.append),
        emulator_ns=emulator_ns,
    )


def test_get_root_uses_root_url_and_auth() -> None:
    session = FakeSession(FakeResponse(200, '{"a": 1}'))
    assert make(session, []).get() == {"a": 1}
    assert session.calls == [("GET", "https://db.example/.json", {"auth": JWT}, None)]


def test_emulator_ns_is_sent() -> None:
    session = FakeSession(FakeResponse(200, "null"))
    make(session, [], emulator_ns="kuhy-syncs").get("todo-sync/")
    _, url, params, _ = session.calls[0]
    assert url == "https://db.example/todo-sync.json"
    assert params == {"auth": JWT, "ns": "kuhy-syncs"}


def test_put_sends_compact_json() -> None:
    session = FakeSession(FakeResponse(200, "{}"))
    make(session, []).put("ns", {"k": [1, 2]})
    assert session.calls[0][0] == "PUT"
    assert session.calls[0][3] == '{"k":[1,2]}'


@pytest.mark.parametrize("path", ["", "/"])
def test_root_put_is_refused(path: str) -> None:
    session = FakeSession()
    with pytest.raises(BackupError, match=r"^VERIFY refusing a root PUT"):
        make(session, []).put(path, {})
    assert session.calls == []


def test_transient_errors_retry_then_succeed() -> None:
    sleeps: list[float] = []
    session = FakeSession(
        requests.ConnectionError("dns"),
        requests.Timeout("slow"),
        FakeResponse(200, "1"),
    )
    assert make(session, sleeps).get() == 1
    assert sleeps == [1.0, 2.0]


def test_retries_exhausted_raises_redacted_network_error() -> None:
    sleeps: list[float] = []
    session = FakeSession(
        *(requests.ConnectionError(f"https://x/.json?auth={JWT}") for _ in range(3))
    )
    with pytest.raises(BackupError) as caught:
        make(session, sleeps).get()
    message = str(caught.value)
    assert message.startswith("NETWORK GET")
    assert "after 3 attempts" in message
    assert JWT not in message
    assert "<redacted>" in message


def test_http_error_is_redacted_and_not_retried() -> None:
    sleeps: list[float] = []
    session = FakeSession(FakeResponse(401, f'{{"error": "bad {JWT}"}}'))
    with pytest.raises(BackupError) as caught:
        make(session, sleeps).get()
    assert str(caught.value).startswith(
        "HTTP GET https://db.example/.json returned 401"
    )
    assert JWT not in str(caught.value)
    assert sleeps == []


def test_redact_empty_secret_is_identity() -> None:
    assert redact("text", "") == "text"


def test_default_session_and_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    session = FakeSession(FakeResponse(200, '"two"'))
    monkeypatch.setattr(_rtdb.requests, "Session", lambda: session)
    assert RtdbClient("https://db.example", lambda: JWT).get() == "two"
    assert session.timeouts == [120.0]
    assert Retry().delays == (15.0, 60.0, 180.0)
