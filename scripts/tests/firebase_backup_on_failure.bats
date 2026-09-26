#!/usr/bin/env bats
# Tests for scripts/firebase_backup_on_failure.sh. journalctl and notify-send
# are replaced through the script's JOURNAL_CMD / NOTIFY_CMD hooks and every
# path is redirected into a temp dir, so nothing live is read or written. The
# real OnFailure path was exercised against the installed unit by hand.

SCRIPT="${BATS_TEST_DIRNAME}/../firebase_backup_on_failure.sh"

setup() {
	TMP="$(mktemp -d)"
	export STATE_DIR="${TMP}/state"
	export BACKUP_DIR="${TMP}/backups"
	export PROMPT_FILE="${TMP}/prompts/TODO-firebase-backup-failure.md"
	export JOURNAL_CMD="${TMP}/journalctl"
	export NOTIFY_CMD="${TMP}/notify-send"
	mkdir -p "${BACKUP_DIR}"
	# The fake journal prints whatever the test put in journal.txt.
	printf '#!/bin/bash\ncat "%s/journal.txt"\n' "${TMP}" >"${JOURNAL_CMD}"
	printf '#!/bin/bash\necho "$*" >>"%s/notify.log"\n' "${TMP}" >"${NOTIFY_CMD}"
	chmod +x "${JOURNAL_CMD}" "${NOTIFY_CMD}"
}

teardown() {
	rm -rf "${TMP}"
}

# `! grep` does not fail a bats test (bash exempts `!` from errexit).
refute_grep() {
	if grep -q "$1" "$2"; then
		echo "unexpected match for '$1' in $2" >&2
		return 1
	fi
}

journal() {
	printf '%s\n' "$@" >"${TMP}/journal.txt"
}

@test "NO_SESSION: prompt names the seed script, notifies, logs" {
	journal "x ERROR firebase_backup: FAILED NO_SESSION no stored Firebase session"
	run "${SCRIPT}"
	[ "${status}" -eq 0 ]
	grep -q '^# Fix: Firebase daily backup failed (NO_SESSION)' "${PROMPT_FILE}"
	grep -q '^REMOVE ME AFTER FINISH$' "${PROMPT_FILE}"
	grep -q 'seed_firebase_backup_session.sh' "${PROMPT_FILE}"
	grep -q 'last good snapshot: `none`' "${PROMPT_FILE}"
	grep -q 'critical Firebase backup FAILED (NO_SESSION)' "${TMP}/notify.log"
	grep -q 'FAILED class=NO_SESSION' "${STATE_DIR}/failures.log"
}

@test "each tagged class is classified" {
	local tag
	for tag in AUTH SHRINK EMPTY NETWORK HTTP VERIFY; do
		journal "x ERROR firebase_backup: FAILED ${tag} something"
		run "${SCRIPT}"
		[ "${status}" -eq 0 ]
		grep -q "failed (${tag})" "${PROMPT_FILE}"
	done
}

@test "SHRINK prompt forbids weakening the gate" {
	journal "x ERROR firebase_backup: FAILED SHRINK namespaces gone: todo-sync"
	run "${SCRIPT}"
	grep -q 'Never "fix" this by weakening the gate' "${PROMPT_FILE}"
}

@test "import errors and untagged crashes" {
	journal "ModuleNotFoundError: No module named 'crdt_sync'"
	run "${SCRIPT}"
	grep -q 'failed (IMPORT)' "${PROMPT_FILE}"
	grep -q 'pip install --user' "${PROMPT_FILE}"

	journal "Killed"
	run "${SCRIPT}"
	grep -q 'failed (UNKNOWN)' "${PROMPT_FILE}"
	grep -q 'python3 -m firebase_backup.backup' "${PROMPT_FILE}"
}

@test "tokens are scrubbed from the prompt and the failure log" {
	journal "GET https://db/.json?auth=eyJhbGci.eyJzdWIi.c2lnbmF0dXJl&ns=x failed" \
		"bare eyJaaa.bbb.ccc token"
	run "${SCRIPT}"
	refute_grep 'eyJ' "${PROMPT_FILE}"
	refute_grep 'eyJ' "${STATE_DIR}/failures.log"
	grep -q 'auth=<redacted>' "${PROMPT_FILE}"
	grep -q '<redacted-jwt>' "${PROMPT_FILE}"
}

@test "last good snapshot ignores pre-restore files and picks the newest" {
	touch "${BACKUP_DIR}/kuhy-syncs-2026-09-25T000000Z.json.gz"
	touch "${BACKUP_DIR}/kuhy-syncs-2026-09-26T000000Z.json.gz"
	touch "${BACKUP_DIR}/kuhy-syncs-2026-09-27T000000Z-pre-restore.json.gz"
	journal "FAILED EMPTY"
	run "${SCRIPT}"
	grep -q 'kuhy-syncs-2026-09-26T000000Z.json.gz`' "${PROMPT_FILE}"
}

@test "failures append to the log; the prompt keeps only the latest" {
	journal "x FAILED AUTH one"
	run "${SCRIPT}"
	journal "x FAILED HTTP two"
	run "${SCRIPT}"
	[ "$(grep -c '^=====' "${STATE_DIR}/failures.log")" -eq 2 ]
	grep -q 'failed (HTTP)' "${PROMPT_FILE}"
	refute_grep 'failed (AUTH)' "${PROMPT_FILE}"
}

@test "a broken notify-send does not mask the prompt" {
	printf '#!/bin/bash\necho "no dbus" >&2\nexit 1\n' >"${NOTIFY_CMD}"
	journal "x FAILED NETWORK down"
	run "${SCRIPT}"
	[ "${status}" -eq 0 ]
	[ -f "${PROMPT_FILE}" ]
	grep -q 'no dbus' "${STATE_DIR}/failures.log"
}
