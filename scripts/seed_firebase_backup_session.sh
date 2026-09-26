#!/bin/bash

# ============================================================================
# Seed the Firebase session the daily backup runs on (one Google consent).
#
# The sync account is Google-sign-in only, so a headless timer cannot create
# its own session. This runs crdt-sync's seed_session for the
# `firebase_backup` app, which stores ~/.config/firebase_backup/firebase_auth.json
# and proves it with an authenticated read. Rerun whenever the backup's fix
# prompt says NO_SESSION or AUTH.
#
# Usage: seed_firebase_backup_session.sh
# ============================================================================

set -euo pipefail

readonly CRDT_SYNC_DIR="${CRDT_SYNC_DIR:-$HOME/src/utils/crdt-sync}"
readonly SECRET_FILE="$HOME/.config/crdt-sync/oauth_client_secret"
# The project's Web OAuth client -- the same id refresh_oauth_secret.sh uses.
readonly CLIENT_ID="845446124781-prdoherj0v64vc6egvvcp3l0693khaur.apps.googleusercontent.com"

main() {
    if [[ ! -s "$SECRET_FILE" ]]; then
        echo "Error: $SECRET_FILE is missing; run:" >&2
        echo "  $CRDT_SYNC_DIR/tool/refresh_oauth_secret.sh --app firebase_backup" >&2
        exit 1
    fi
    cd "$CRDT_SYNC_DIR"
    python3 -m tool.seed_session \
        --client-id "$CLIENT_ID" \
        --client-secret "$(<"$SECRET_FILE")" \
        --app firebase_backup
}

main "$@"
