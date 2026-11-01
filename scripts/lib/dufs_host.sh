#!/bin/bash
# dufs_host.sh — host-facing steps of setup_dufs_cloud.sh: preflight, dufs
# binary install, systemd units, Caddy, DuckDNS, firewall, KeePass auto-sync
# and the final report. Sourced by that script (not run directly): it relies on
# the globals/constants and log_*/die helpers the entry script defines.

set -euo pipefail

# --- Step 1: preflight -------------------------------------------------------
preflight() {
	log_info "Preflight checks"
	[[ ${EUID} -ne 0 ]] || die "Run as your normal user, not root (it will sudo where needed)."

	# Runtime deps; install any that are missing from the official repos.
	install_missing_pacman_packages curl rsync inotify-tools openssl

	# The public-exposure stack must already exist (Caddy from setup_gitea.sh).
	has_cmd docker || die "docker not found — run setup_gitea.sh first."
	docker ps --format '{{.Names}}' | grep -qx "${CADDY_CONTAINER}" \
		|| die "Caddy container '${CADDY_CONTAINER}' not running — run setup_gitea.sh first."
	[[ -f ${CADDYFILE} ]] || die "Caddyfile ${CADDYFILE} missing — run setup_gitea.sh first."
	[[ -x ${DUCKDNS_UPDATER} ]] || die "DuckDNS updater ${DUCKDNS_UPDATER} missing — run install_joplin.sh first."
	log_ok "Host exposure stack present (docker + ${CADDY_CONTAINER} + DuckDNS updater)"
}

# --- Step 3: install the pinned, checksum-verified dufs binary ---------------
install_dufs() {
	if [[ -x ${DUFS_BIN} ]] && "${DUFS_BIN}" --version 2>/dev/null | grep -q "${DUFS_VERSION}"; then
		log_ok "dufs ${DUFS_VERSION} already installed"
		return 0
	fi
	log_info "Installing dufs ${DUFS_VERSION}"
	local tmp
	tmp="$(mktemp -d)"
	# shellcheck disable=SC2064
	trap "rm -rf '${tmp}'" RETURN
	curl -fsSL -o "${tmp}/${DUFS_ASSET}" "${DUFS_URL}"
	echo "${DUFS_SHA256}  ${tmp}/${DUFS_ASSET}" | sha256sum -c - \
		|| die "dufs checksum mismatch — refusing to install."
	tar -xzf "${tmp}/${DUFS_ASSET}" -C "${tmp}"
	sudo install -m 0755 "${tmp}/dufs" "${DUFS_BIN}"
	log_ok "Installed ${DUFS_BIN}"
}

# --- Step 6: systemd units (render placeholders → /etc/systemd/system) -------
render_unit() {
	local name="$1"
	sed -e "s|__USER__|${SYS_USER}|g" \
		-e "s|__HOME__|${HOME}|g" \
		-e "s|__CLOUD_ROOT__|${CLOUD_ROOT}|g" \
		"${SYSTEMD_SRC}/${name}" | sudo tee "/etc/systemd/system/${name}" >/dev/null
}

install_units() {
	log_info "Installing systemd units"
	render_unit dufs.service
	render_unit keepass-cloud-sync.service
	render_unit keepass-cloud-sync.path
	sudo systemctl daemon-reload
	sudo systemctl enable --now dufs.service
	log_ok "dufs.service enabled and started"
}

# --- Step 7: Caddy reverse-proxy block (append + reload) ---------------------
configure_caddy() {
	if grep -qE "^${DUFS_SUBDOMAIN} \{" "${CADDYFILE}"; then
		log_ok "Caddyfile already has a block for ${DUFS_SUBDOMAIN}"
	else
		log_info "Adding Caddy block for ${DUFS_SUBDOMAIN}"
		# NOTE: appended to the shared Gitea Caddyfile. Re-running setup_gitea.sh
		# regenerates that file and drops this block — re-run setup_dufs_cloud.sh
		# to restore it. Caddyfile uses tab indentation.
		printf '\n%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' "${DUFS_SUBDOMAIN}" "${DUFS_PORT}" \
			>>"${CADDYFILE}"
	fi
	docker exec "${CADDY_CONTAINER}" caddy reload --config "${CADDYFILE_IN_CONTAINER}" \
		|| die "caddy reload failed — check 'docker logs ${CADDY_CONTAINER}'."
	log_ok "Caddy reloaded (auto-HTTPS will be issued once the subdomain resolves)"
}

# --- Step 8: DuckDNS subdomain (extend existing updater; no new cron) --------
configure_duckdns() {
	local label="${DUFS_SUBDOMAIN%.duckdns.org}"
	if grep -qE "domains=[^&\"']*${label}([,&\"']|$)" "${DUCKDNS_UPDATER}"; then
		log_ok "DuckDNS updater already includes '${label}'"
	else
		log_info "Adding '${label}' to the existing DuckDNS updater"
		sed -i -E "s|(domains=)([^&\"']*)|\1\2,${label}|" "${DUCKDNS_UPDATER}"
	fi
	# Refresh now (harmless if the subdomain isn't registered yet).
	bash "${DUCKDNS_UPDATER}" || log_warn "DuckDNS update returned non-zero (register the subdomain first)."
	if getent hosts "${DUFS_SUBDOMAIN}" >/dev/null 2>&1; then
		log_ok "${DUFS_SUBDOMAIN} resolves"
	else
		log_warn "${DUFS_SUBDOMAIN} does not resolve yet — create the '${label}' subdomain in the DuckDNS dashboard."
	fi
}

# --- Step 9: firewall (open 80/443 via the owning script, idempotent) -------
ensure_firewall() {
	if sudo nft list ruleset 2>/dev/null | grep -qE 'dport \{[^}]*80[^}]*443'; then
		log_ok "Firewall already allows tcp/80 + tcp/443"
	elif [[ -f ${WG_SCRIPT} ]]; then
		log_info "Opening 80/443 via setup_wireguard_ssh.sh allow-web"
		sudo bash "${WG_SCRIPT}" allow-web
	else
		log_warn "setup_wireguard_ssh.sh not found — ensure tcp/80+443 are open."
	fi
}

# --- Step 10: KeePass auto-sync (initial mirror + enable the path watcher) ---
setup_autosync() {
	log_info "Setting up KeePass auto-sync watcher"
	# Mirror only the vault file (not the whole dir with local .backup_* vaults).
	rsync -a "${HOME}/data/Keepass/Passwords.kdbx" "${CLOUD_ROOT}/Keepass/"
	sudo systemctl enable --now keepass-cloud-sync.path
	log_ok "Vault mirrored and watcher enabled"
}

# --- Step 11: report ---------------------------------------------------------
print_report() {
	local url="https://${DUFS_SUBDOMAIN}"
	cat <<EOF

============================================================================
  dufs cloud is up.
    Web UI / WebDAV : ${url}/
    Login           : ${DUFS_USER} / (your password)
    Served folder   : ${CLOUD_ROOT}
    KeePassDX target: ${url}/Keepass/Passwords.kdbx  (WebDAV)

  If the subdomain is new, create it once in the DuckDNS dashboard
  (label: ${DUFS_SUBDOMAIN%.duckdns.org}) so Caddy can issue TLS.

  Acceptance test: on your phone with Wi-Fi OFF (cellular), open ${url}/,
  log in, and confirm you see Keepass/Passwords.kdbx.
============================================================================
EOF
}
