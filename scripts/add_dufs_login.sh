#!/bin/bash
# add_dufs_login.sh — give one app its own dufs login, scoped to one folder.
#
# Every app that pushes files into the cloud (RunnerUp, todo, …) should get a
# login that can reach only its own folder, so a leaked phone credential cannot
# read Keepass. This makes adding one a single command instead of a hand edit
# of dufs.yaml:
#
#   1. generates a 32-char [A-Za-z0-9] password (safe for `adb shell input text`)
#   2. appends `user:<sha512-crypt>@/path[:rw]` to dufs.yaml's auth list, in the
#      exact form setup_dufs_cloud.sh preserves across its own re-runs
#   3. creates the folder, restarts dufs, and PROVES the scope: 207 on the
#      folder, 403 just outside it. Any other answer restores the old config.
#   4. writes ~/.config/dufs/logins/<user>.env (0600) and puts the password on
#      the clipboard for pasting into the phone.
#
# Idempotent: an existing login is left alone. --rotate replaces its password.
#
# Usage: add_dufs_login.sh <user> </path> [ro|rw] [--rotate]

set -euo pipefail

readonly DUFS_CONFIG="${DUFS_CONFIG:-${HOME}/.config/dufs/dufs.yaml}"
readonly LOGINS_DIR="${DUFS_LOGINS_DIR:-${HOME}/.config/dufs/logins}"
readonly PUBLIC_URL="${DUFS_PUBLIC_URL:-https://kuhy-cloud.duckdns.org}"
readonly SERVICE="${DUFS_SERVICE:-dufs.service}"
# A sibling that cannot exist: dufs answers 403 for any path outside a
# login's scope, whether or not it exists, so this probes the scope without
# touching real data.
readonly SCOPE_PROBE="/__dufs_login_scope_probe__/"

LOGIN_USER=""
LOGIN_PATH=""
MODE="rw"
ROTATE=0
BACKUP=""

log_info() { printf '[INFO] %s\n' "$*"; }
log_ok() { printf '[ OK ] %s\n' "$*"; }
log_warn() { printf '[WARN] %s\n' "$*" >&2; }
die() {
	printf '[FAIL] %s\n' "$*" >&2
	exit 1
}

usage() {
	sed -n '2,19s/^# \{0,1\}//p' "$0"
	exit "${1:-0}"
}

cleanup() {
	if [[ -n ${BACKUP} && -f ${BACKUP} ]]; then
		rm -f "${BACKUP}"
	fi
}
trap cleanup EXIT

parse_args() {
	local positional=()
	while [[ $# -gt 0 ]]; do
		case "$1" in
		--rotate) ROTATE=1 ;;
		-h | --help) usage 0 ;;
		-*) die "unknown option: $1" ;;
		*) positional+=("$1") ;;
		esac
		shift
	done
	[[ ${#positional[@]} -ge 2 && ${#positional[@]} -le 3 ]] || usage 1
	LOGIN_USER="${positional[0]}"
	LOGIN_PATH="${positional[1]%/}"
	MODE="${positional[2]:-rw}"
}

validate() {
	[[ ${LOGIN_USER} =~ ^[a-z][a-z0-9_-]{0,31}$ ]] ||
		die "user must match [a-z][a-z0-9_-]*: ${LOGIN_USER}"
	[[ ${LOGIN_PATH} =~ ^/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ]] ||
		die "path must be absolute, e.g. /todo-images: ${LOGIN_PATH}"
	[[ ${LOGIN_PATH} != *..* ]] || die "path may not contain '..'"
	[[ ${MODE} == ro || ${MODE} == rw ]] || die "mode must be ro or rw: ${MODE}"
	[[ -f ${DUFS_CONFIG} ]] || die "no dufs config at ${DUFS_CONFIG}"
}

ensure_tools() {
	local missing=()
	local tool
	for tool in openssl curl; do
		command -v "${tool}" >/dev/null || missing+=("${tool}")
	done
	if [[ -n ${DISPLAY:-} ]] && ! command -v xclip >/dev/null; then
		missing+=(xclip)
	fi
	if [[ ${#missing[@]} -gt 0 ]]; then
		log_info "installing: ${missing[*]}"
		sudo pacman -S --needed --noconfirm "${missing[@]}"
	fi
}

# Reads a top-level scalar (serve-path, port) from the flat dufs.yaml.
config_value() {
	sed -n "s/^$1: *//p" "${DUFS_CONFIG}" | head -n 1
}

has_login() {
	grep -q "^  - \"${LOGIN_USER}:" "${DUFS_CONFIG}"
}

new_password() {
	# base64 of 48 random bytes leaves ~60 alphanumerics; keep 32.
	openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32
}

# Writes the auth line right after the last existing one, dropping any old
# line for this user (the --rotate case).
write_auth_line() {
	local hash="$1"
	local scope="${LOGIN_PATH}"
	[[ ${MODE} == rw ]] && scope="${LOGIN_PATH}:rw"
	local line="  - \"${LOGIN_USER}:${hash}@${scope}\""
	local tmp
	tmp="$(mktemp "${DUFS_CONFIG}.XXXXXX")"
	awk -v user="  - \"${LOGIN_USER}:" -v line="${line}" '
		index($0, user) == 1 { next }
		{ buf[++n] = $0; if ($0 ~ /^  - "/) last = n }
		END {
			if (!last) { exit 3 }
			for (i = 1; i <= n; i++) { print buf[i]; if (i == last) print line }
		}' "${DUFS_CONFIG}" >"${tmp}" || {
		rm -f "${tmp}"
		die "no auth entries in ${DUFS_CONFIG}; run setup_dufs_cloud.sh first"
	}
	chmod 600 "${tmp}"
	mv "${tmp}" "${DUFS_CONFIG}"
}

restart_dufs() {
	sudo systemctl restart "${SERVICE}"
}

# PROPFIND status for <path> as the new login, retried while dufs starts.
propfind_status() {
	local url="$1" password="$2" code="000" _
	for _ in 1 2 3 4 5 6 7 8 9 10; do
		code="$(curl -s -o /dev/null -w '%{http_code}' -u "${LOGIN_USER}:${password}" \
			-X PROPFIND -H 'Depth: 0' "${url}" || true)"
		[[ ${code} != 000 ]] && break
		sleep 0.5
	done
	printf '%s' "${code}"
}

verify_scope() {
	local password="$1"
	local base
	base="http://127.0.0.1:$(config_value port)"
	local inside outside
	inside="$(propfind_status "${base}${LOGIN_PATH}/" "${password}")"
	outside="$(propfind_status "${base}${SCOPE_PROBE}" "${password}")"
	[[ ${inside} == 207 && ${outside} == 403 ]] && return 0
	log_warn "scope check failed: ${LOGIN_PATH} → ${inside} (want 207), outside → ${outside} (want 403)"
	return 1
}

write_env() {
	local password="$1"
	local env_file="${LOGINS_DIR}/${LOGIN_USER}.env"
	mkdir -p "${LOGINS_DIR}"
	chmod 700 "${LOGINS_DIR}"
	(
		umask 077
		printf 'DUFS_URL=%s\nDUFS_USER=%s\nDUFS_PASSWORD=%s\nDUFS_PATH=%s\n' \
			"${PUBLIC_URL}" "${LOGIN_USER}" "${password}" "${LOGIN_PATH}" >"${env_file}"
	)
	log_ok "credentials → ${env_file}"
}

copy_to_clipboard() {
	local password="$1"
	# xclip forks a daemon that holds the selection. It inherits stdout, so
	# without the redirect anything reading this script's output (a pipe,
	# `vm run`, ssh) waits for EOF until someone else takes the clipboard.
	if [[ -n ${DISPLAY:-} ]] && printf '%s' "${password}" | xclip -selection clipboard >/dev/null 2>&1; then
		log_ok "password is on the clipboard"
	else
		log_warn "no clipboard; the password is in ${LOGINS_DIR}/${LOGIN_USER}.env"
	fi
}

main() {
	parse_args "$@"
	validate
	if has_login && [[ ${ROTATE} -eq 0 ]]; then
		[[ -f "${LOGINS_DIR}/${LOGIN_USER}.env" ]] ||
			die "login ${LOGIN_USER} exists but its .env is gone; re-run with --rotate"
		log_ok "login ${LOGIN_USER} already exists (use --rotate for a new password)"
		return 0
	fi
	ensure_tools

	local serve_path password hash
	serve_path="$(config_value serve-path)"
	[[ -n ${serve_path} ]] || die "no serve-path in ${DUFS_CONFIG}"
	mkdir -p "${serve_path}${LOGIN_PATH}"

	password="$(new_password)"
	[[ ${#password} -eq 32 ]] || die "password generation failed"
	hash="$(printf '%s' "${password}" | openssl passwd -6 -stdin)"

	BACKUP="$(mktemp "${DUFS_CONFIG}.bak.XXXXXX")"
	cp -p "${DUFS_CONFIG}" "${BACKUP}"
	write_auth_line "${hash}"
	restart_dufs
	if ! verify_scope "${password}"; then
		cp -p "${BACKUP}" "${DUFS_CONFIG}"
		restart_dufs
		die "restored the previous ${DUFS_CONFIG}; nothing changed"
	fi
	log_ok "login ${LOGIN_USER} → ${LOGIN_PATH} (${MODE}), scope verified"
	write_env "${password}"
	copy_to_clipboard "${password}"
}

main "$@"
