#!/bin/bash

# ============================================================================
# Install the daily Firebase RTDB backup as systemd USER units (no root).
#
# Checks the Python dependencies are importable, installs the three units
# from scripts/systemd/ into ~/.config/systemd/user/, and enables the timer.
# Does NOT pip install crdt_sync: every production unit on this machine
# shares /usr/bin/python3's user-site copy, so upgrading it here could break
# them. A missing dependency is reported with the command, not auto-fixed.
#
# Usage: setup_firebase_backup.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly UNIT_SRC="$SCRIPT_DIR/systemd"
readonly UNIT_DST="$HOME/.config/systemd/user"
readonly BACKUP_DIR="$HOME/data/cloud/firebase_backups"
readonly UNITS=(firebase-backup.service firebase-backup-failure.service firebase-backup.timer)

check_python_deps() {
    # From /tmp so the crdt-sync working tree can never shadow the real install.
    if ! (cd /tmp && /usr/bin/python3 -c 'import crdt_sync, requests'); then
        echo "Error: crdt_sync/requests not importable by /usr/bin/python3." >&2
        echo "  Pinned in pyproject.toml; install that tag with pip --user." >&2
        exit 1
    fi
}

install_units() {
    mkdir -p "$UNIT_DST"
    local unit
    for unit in "${UNITS[@]}"; do
        install -m 0644 "$UNIT_SRC/$unit" "$UNIT_DST/$unit"
    done
    systemctl --user daemon-reload
    systemctl --user enable --now firebase-backup.timer
}

main() {
    check_python_deps
    mkdir -p "$BACKUP_DIR"
    chmod 0700 "$BACKUP_DIR"
    install_units
    echo "Installed. Next run:"
    systemctl --user list-timers firebase-backup.timer --no-pager | head -3
    if [[ ! -s "$HOME/.config/firebase_backup/firebase_auth.json" ]]; then
        echo "No session yet: run $SCRIPT_DIR/seed_firebase_backup_session.sh"
    fi
}

main "$@"
