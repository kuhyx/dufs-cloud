# Copyright (c) 2026 Krzysztof Rudnicki
"""This job's own Firebase session, with errors that name the fix.

Deliberately not ``crdt_sync.firebase_client_for``: with no stored session it
falls back to the shared password, which the account no longer accepts since
the move to Google sign-in, and fails with a misleading
``INVALID_LOGIN_CREDENTIALS``. Here a missing or revoked session says so.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from crdt_sync import (
    ConfigError,
    FirebaseAuthError,
    FirebaseConfig,
    FirebaseTokenProvider,
    credential_store_for,
)

from firebase_backup._errors import BackupError
from firebase_backup._paths import APP_NAME, RESEED_HINT

if TYPE_CHECKING:
    from collections.abc import Callable


def session_token(
    config: FirebaseConfig, app_name: str = APP_NAME
) -> Callable[[], str]:
    """Return a callable yielding a valid ID token for ``app_name``'s session.

    Raises:
        BackupError: ``NO_SESSION`` if the session was never seeded.
    """
    provider = FirebaseTokenProvider(config.api_key, credential_store_for(app_name))
    if not provider.has_session():
        msg = f"NO_SESSION no stored Firebase session for {app_name}; {RESEED_HINT}"
        raise BackupError(msg)

    def token() -> str:
        try:
            return provider.id_token()
        except FirebaseAuthError as exc:
            msg = f"AUTH token refresh for {app_name} failed ({exc}); {RESEED_HINT}"
            raise BackupError(msg) from None

    return token


def load_config() -> FirebaseConfig:
    """Load the shared ``~/.config/crdt-sync/firebase.json``.

    Raises:
        BackupError: ``AUTH`` if it is missing or malformed.
    """
    try:
        return FirebaseConfig.load()
    except ConfigError as exc:
        msg = f"AUTH shared Firebase config unusable: {exc}"
        raise BackupError(msg) from None
