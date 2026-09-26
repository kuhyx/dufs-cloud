#!/bin/bash

# ============================================================================
# OnFailure handler for firebase-backup.service: log hard, notify, and write
# a ready-to-paste prompt for a Claude session to fix the failure.
#
# Runs from systemd (OnFailure=firebase-backup-failure.service), so it covers
# every way the backup can die -- including ones the Python never sees, like
# a missing crdt_sync after a Python upgrade, a timeout, or an OOM kill.
#
# Writes:
#   ~/.local/state/firebase-backup/failures.log        append-only, every failure
#   <repo>/prompts/TODO-firebase-backup-failure.md     overwritten: the latest one
#
# Usage: firebase_backup_on_failure.sh [unit-name]
# Test hooks: JOURNAL_CMD, NOTIFY_CMD, STATE_DIR, BACKUP_DIR, PROMPT_FILE.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly SCRIPT_DIR REPO_DIR
readonly UNIT="${1:-firebase-backup.service}"
readonly STATE_DIR="${STATE_DIR:-$HOME/.local/state/firebase-backup}"
readonly BACKUP_DIR="${BACKUP_DIR:-$HOME/data/cloud/firebase_backups}"
readonly PROMPT_FILE="${PROMPT_FILE:-$REPO_DIR/prompts/TODO-firebase-backup-failure.md}"
readonly JOURNAL_CMD="${JOURNAL_CMD:-journalctl}"
readonly NOTIFY_CMD="${NOTIFY_CMD:-notify-send}"

# ID tokens are JWTs (three base64url segments, "eyJ..."). The Python already
# redacts them; this is the second net, because this file is committed.
scrub() {
    sed -E 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/<redacted-jwt>/g; s/(auth=)[^&[:space:]"]+/\1<redacted>/g'
}

# The Python prefixes every expected failure with a class tag; anything else
# (import error, traceback, kill) falls through to UNKNOWN.
classify() {
    local log="$1"
    local tag
    for tag in NO_SESSION AUTH SHRINK EMPTY NETWORK HTTP VERIFY; do
        if grep -q "FAILED $tag " <<<"$log"; then
            echo "$tag"
            return
        fi
    done
    if grep -q 'ModuleNotFoundError\|ImportError' <<<"$log"; then
        echo IMPORT
    else
        echo UNKNOWN
    fi
}

fix_for() {
    case "$1" in
        NO_SESSION|AUTH) cat <<'EOF'
The job's Firebase session is missing or revoked. The fix needs one browser
consent from kuhy: ask them to run `! ~/src/dufs-cloud/scripts/seed_firebase_backup_session.sh`.
If that fails with `invalid_client`, the Web client secret was rotated:
`! ~/src/utils/crdt-sync/tool/refresh_oauth_secret.sh --app firebase_backup`.
Do NOT borrow another app's ~/.config/<app>/firebase_auth.json.
EOF
            ;;
        SHRINK) cat <<'EOF'
A namespace that existed in the previous snapshot is gone from the live
database. This may be real data loss in an app. Investigate which app owns the
namespace and why it vanished BEFORE anything else. The previous snapshot
(named in the journal excerpt) still holds its data; restoring it is
`python3 -m firebase_backup.restore <that-file> --namespace <ns>` -- a dry
run first, then `--yes` only with kuhy's go-ahead.
Never "fix" this by weakening the gate. If the removal was intentional, the
next run passes on its own (it compares against the newest snapshot).
EOF
            ;;
        IMPORT) cat <<'EOF'
The Python could not import a dependency -- most likely crdt_sync or requests
vanished from /usr/bin/python3's user site-packages after a Python upgrade.
Reinstall the pinned tag from pyproject.toml with
`pip install --user --break-system-packages 'crdt-sync @ git+https://github.com/kuhyx/utils@<tag>#subdirectory=crdt-sync'`
-- other production units share that copy, so check with kuhy first.
EOF
            ;;
        *) cat <<'EOF'
Read the journal excerpt below, reproduce with
`cd ~/src/dufs-cloud && python3 -m firebase_backup.backup`, and fix the cause.
Transient network failures are already retried 3 times inside one run.
EOF
            ;;
    esac
}

write_prompt() {
    local now="$1" cls="$2" last_good="$3" excerpt="$4"
    mkdir -p "$(dirname "$PROMPT_FILE")"
    cat >"$PROMPT_FILE" <<EOF
# Fix: Firebase daily backup failed ($cls)

REMOVE ME AFTER FINISH

Written by \`scripts/firebase_backup_on_failure.sh\` at $now. Only the most
recent failure is kept here; every failure is in
\`$STATE_DIR/failures.log\`.

## what
The daily \`$UNIT\` (user unit, timer \`firebase-backup.timer\`) failed, so
the kuhy-syncs RTDB was not backed up into \`$BACKUP_DIR\`.

- failure class: **$cls**
- last good snapshot: \`${last_good:-none}\`

## fix
$(fix_for "$cls")

## done
\`systemctl --user start $UNIT\` exits 0, a new \`kuhy-syncs-*.json.gz\` appears
in \`$BACKUP_DIR\`, and \`zcat <it> | jq 'keys'\` lists every namespace.
Then delete this file and commit the deletion.

## verify
\`\`\`
systemctl --user start $UNIT; systemctl --user status $UNIT --no-pager | head -5
ls -la $BACKUP_DIR | tail -3
journalctl --user -u $UNIT -n 30 --no-pager
\`\`\`

## journal excerpt (tokens redacted)
\`\`\`
$excerpt
\`\`\`
EOF
}

main() {
    local now excerpt cls last_good
    now="$(date -Is)"
    mkdir -p "$STATE_DIR"
    excerpt="$("$JOURNAL_CMD" --user -u "$UNIT" -n 60 --no-pager -o short-iso 2>&1 | scrub || true)"
    cls="$(classify "$excerpt")"
    last_good="$(find "$BACKUP_DIR" -maxdepth 1 -name 'kuhy-syncs-*.json.gz' ! -name '*-pre-restore*' 2>/dev/null | sort | tail -1)"

    {
        echo "===== $now $UNIT FAILED class=$cls last_good=${last_good:-none}"
        echo "$excerpt"
    } >>"$STATE_DIR/failures.log"

    write_prompt "$now" "$cls" "$last_good" "$excerpt"
    echo "firebase backup FAILED ($cls); prompt written to $PROMPT_FILE"

    # Best effort: a notification failure is logged, never masks the rest.
    if ! "$NOTIFY_CMD" -u critical "Firebase backup FAILED ($cls)" \
        "Fix prompt: $PROMPT_FILE" 2>>"$STATE_DIR/failures.log"; then
        echo "notify-send failed (logged); prompt file is still written" >&2
    fi
}

main "$@"
