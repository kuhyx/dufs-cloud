#!/bin/bash
# setup_dufs_cloud.sh — Self-hosted "cloud" storage (dufs) on this Arch PC.
#
# Stands up dufs (a single Rust binary: web UI + built-in WebDAV over a real
# folder), bound to 127.0.0.1 and fronted by the EXISTING Caddy reverse proxy
# (from setup_gitea.sh) for automatic public HTTPS at a new DuckDNS subdomain.
# Also mirrors the KeePassXC vault into the served folder on every change so it
# is always fetchable from the phone (KeePassDX syncs it natively over WebDAV).
#
# Reuses the host's existing exposure stack — it does NOT add a second Caddy,
# a second DuckDNS updater, or hand-edit /etc/nftables.conf. See
# .github/skills/self-hosted-service-exposure/SKILL.md.
#
# Run as your normal user (NOT root). It uses sudo only for pacman, the binary
# install, systemd units and the firewall flag. Idempotent — safe to re-run.
#
# Usage:
#   ./setup_dufs_cloud.sh          Install / update everything
#   ./setup_dufs_cloud.sh -h       Show help

set -euo pipefail

# --- Pinned dufs release (verified by sha256) --------------------------------
readonly DUFS_VERSION="0.46.0"
readonly DUFS_SHA256="817769f726613194bcff9d0e3e481eaccc86ac11208857614f36a8c02f410977"
readonly DUFS_ASSET="dufs-v${DUFS_VERSION}-x86_64-unknown-linux-musl.tar.gz"
readonly DUFS_URL="https://github.com/sigoden/dufs/releases/download/v${DUFS_VERSION}/${DUFS_ASSET}"
readonly DUFS_BIN="/usr/local/bin/dufs"
readonly DUFS_PORT=5000

# --- Existing host infrastructure (from setup_gitea.sh / install_joplin.sh) --
readonly CADDY_CONTAINER="gitea-caddy"
readonly CADDYFILE="${HOME}/services/gitea/Caddyfile"
readonly CADDYFILE_IN_CONTAINER="/etc/caddy/Caddyfile"
readonly DUCKDNS_UPDATER="${HOME}/.joplin-server/duckdns-update.sh"

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
readonly SCRIPT_DIR
readonly SYSTEMD_SRC="${SCRIPT_DIR}/systemd"
readonly WG_SCRIPT="${SCRIPT_DIR}/setup_wireguard_ssh.sh"
readonly CONFIG_FILE="${SCRIPT_DIR}/.dufs_cloud.conf"

# Git repo root (used by the paranoid secret guards below).
REPO_ROOT="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || true)"
readonly REPO_ROOT

# shellcheck source=../../lib/common.sh
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../../lib/common.sh"

# Step implementations live in lib/ (resolved via the symlink-safe SCRIPT_DIR).
# shellcheck source=lib/dufs_host.sh
source "${SCRIPT_DIR}/lib/dufs_host.sh"
# shellcheck source=lib/dufs_config.sh
source "${SCRIPT_DIR}/lib/dufs_config.sh"

# OS user that will own and run the service (not the dufs web-login user).
SYS_USER="$(get_actual_user)"
readonly SYS_USER

# Config values (populated from CONFIG_FILE / prompts).
DUFS_USER=""
DUFS_PASSWORD=""
DUFS_SUBDOMAIN=""
CLOUD_ROOT=""

die() {
	log_error "$1"
	exit 1
}

# Help = the leading header block only (everything above `set -euo pipefail`).
usage() {
	sed '/^set -euo pipefail/q' "$0" | grep -E '^#( |$)' | sed -E 's/^# ?//'
	exit 0
}

main() {
	[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage
	print_setup_header "Self-hosted dufs cloud storage"
	preflight
	load_config
	prompt_config
	save_config
	install_dufs
	create_serve_dir
	write_dufs_config
	install_units
	configure_caddy
	configure_duckdns
	ensure_firewall
	setup_autosync
	print_report
}

main "$@"
