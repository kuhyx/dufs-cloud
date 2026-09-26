# Copyright (c) 2026 Krzysztof Rudnicki
"""Session lookup and config loading, with fix-naming error messages."""

from __future__ import annotations

from typing import ClassVar

from crdt_sync import ConfigError, FirebaseAuthError, FirebaseConfig
import pytest

from firebase_backup import _auth
from firebase_backup._errors import BackupError

CONFIG = FirebaseConfig(
    api_key="key",
    database_url="https://db.example",
    project_id="kuhy-syncs",
    uid="uid",
    email="e@example.com",
)


class FakeProvider:
    """Stands in for FirebaseTokenProvider; records what store it was given."""

    session = True
    error: Exception | None = None
    stores: ClassVar[list[tuple[str, object]]] = []

    def __init__(self, api_key: str, store: object) -> None:
        FakeProvider.stores.append((api_key, store))

    def has_session(self) -> bool:
        return FakeProvider.session

    def id_token(self) -> str:
        if FakeProvider.error is not None:
            raise FakeProvider.error
        return "tok"


@pytest.fixture(autouse=True)
def provider(monkeypatch: pytest.MonkeyPatch) -> type[FakeProvider]:
    FakeProvider.session = True
    FakeProvider.error = None
    FakeProvider.stores = []
    monkeypatch.setattr(_auth, "FirebaseTokenProvider", FakeProvider)
    return FakeProvider


def test_token_uses_this_jobs_own_store(
    provider: type[FakeProvider], monkeypatch: pytest.MonkeyPatch
) -> None:
    apps: list[str] = []

    def store_for(app_name: str) -> str:
        apps.append(app_name)
        return f"store:{app_name}"

    monkeypatch.setattr(_auth, "credential_store_for", store_for)
    token = _auth.session_token(CONFIG)
    assert token() == "tok"
    assert apps == ["firebase_backup"]
    assert provider.stores == [("key", "store:firebase_backup")]


def test_missing_session_names_the_reseed_command(
    provider: type[FakeProvider],
) -> None:
    provider.session = False
    with pytest.raises(
        BackupError, match=r"^NO_SESSION .*seed_firebase_backup_session"
    ):
        _auth.session_token(CONFIG)


def test_revoked_refresh_is_auth_error(provider: type[FakeProvider]) -> None:
    provider.error = FirebaseAuthError("TOKEN_EXPIRED")
    token = _auth.session_token(CONFIG)
    with pytest.raises(BackupError, match=r"^AUTH .*TOKEN_EXPIRED.*reseed"):
        token()


def test_load_config_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(_auth.FirebaseConfig, "load", classmethod(lambda _cls: CONFIG))
    assert _auth.load_config() is CONFIG


def test_load_config_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(_cls: type) -> FirebaseConfig:
        msg = "firebase.json missing"
        raise ConfigError(msg)

    monkeypatch.setattr(_auth.FirebaseConfig, "load", classmethod(broken))
    with pytest.raises(BackupError, match=r"^AUTH shared Firebase config unusable"):
        _auth.load_config()
