# Copyright (c) 2026 Krzysztof Rudnicki
"""Where snapshots, logs and the session live. Tests redirect every one of these."""

from __future__ import annotations

from pathlib import Path
from typing import Final

# Names this job's credential cache: ~/.config/firebase_backup/firebase_auth.json.
# Its own file rather than a borrowed app's, so two refreshers never race on
# one token file. Must also be listed in crdt-sync's tool/_seeded_apps.py.
APP_NAME: Final = "firebase_backup"

# Served by dufs (serve-path ~/data/cloud), readable by the `kuhy` login only.
BACKUP_DIR: Final = Path.home() / "data" / "cloud" / "firebase_backups"

# Append-only run log: one line per success, full detail on failure. The
# OnFailure handler (scripts/firebase_backup_on_failure.sh) writes next to it.
STATE_DIR: Final = Path.home() / ".local" / "state" / "firebase-backup"
LOG_FILE: Final = STATE_DIR / "backup.log"

# The command a human runs to (re)create the session. Quoted in every auth
# error so the fix is never a hunt through docs.
RESEED_HINT: Final = (
    "reseed the session: ~/src/dufs-cloud/scripts/seed_firebase_backup_session.sh "
    "(if that reports invalid_client, the Web client secret was rotated: "
    "~/src/utils/crdt-sync/tool/refresh_oauth_secret.sh --app firebase_backup)"
)
