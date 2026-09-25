#!/usr/bin/env bats
# Tests for scripts/add_dufs_login.sh. sudo, systemctl and curl are stubbed on
# PATH so this runs in CI without dufs or root; the real server path was
# exercised against a live dufs by hand (see README "Adding an app login").

SCRIPT="${BATS_TEST_DIRNAME}/../add_dufs_login.sh"

setup() {
	TMP="$(mktemp -d)"
	export HOME="${TMP}"
	unset DISPLAY
	CONFIG="${TMP}/.config/dufs/dufs.yaml"
	mkdir -p "${TMP}/.config/dufs" "${TMP}/cloud" "${TMP}/bin"
	cat >"${CONFIG}" <<EOF
serve-path: ${TMP}/cloud
bind: 127.0.0.1
port: 5000
allow-all: true
auth:
  - "kuhy:\$6\$salt\$hash@/:rw"
  - "runnerup:\$6\$salt\$hash@/RunnerUp:rw"
EOF
	# sudo runs its argv; systemctl logs each restart; curl answers from env so
	# a test can make the scope check pass or fail.
	printf '#!/bin/bash\nexec "$@"\n' >"${TMP}/bin/sudo"
	printf '#!/bin/bash\necho "$*" >>"%s/systemctl.log"\n' "${TMP}" >"${TMP}/bin/systemctl"
	cat >"${TMP}/bin/curl" <<'EOF'
#!/bin/bash
url="${*: -1}"
if [[ ${url} == *__dufs_login_scope_probe__* ]]; then
	printf '%s' "${STUB_OUTSIDE:-403}"
else
	printf '%s' "${STUB_INSIDE:-207}"
fi
EOF
	chmod +x "${TMP}/bin/"*
	export PATH="${TMP}/bin:${PATH}"
}

teardown() {
	rm -rf "${TMP}"
}

env_value() {
	sed -n "s/^$1=//p" "${TMP}/.config/dufs/logins/todo.env"
}

@test "adds a scoped rw login after the existing ones and writes a 0600 env" {
	run "${SCRIPT}" todo /todo-images rw
	[ "${status}" -eq 0 ]
	[ "$(tail -n 1 "${CONFIG}" | grep -c '^  - "todo:\$6\$.*@/todo-images:rw"$')" -eq 1 ]
	grep -q '^  - "runnerup:' "${CONFIG}"
	[ -d "${TMP}/cloud/todo-images" ]
	[ "$(stat -c %a "${TMP}/.config/dufs/logins/todo.env")" = 600 ]
	[ "$(env_value DUFS_USER)" = todo ]
	[ "$(env_value DUFS_PATH)" = /todo-images ]
	[ "$(env_value DUFS_URL)" = https://kuhy-cloud.duckdns.org ]
	[[ "$(env_value DUFS_PASSWORD)" =~ ^[A-Za-z0-9]{32}$ ]]
	grep -q 'restart dufs.service' "${TMP}/systemctl.log"
}

@test "the stored hash verifies against the stored password" {
	run "${SCRIPT}" todo /todo-images
	[ "${status}" -eq 0 ]
	hash="$(sed -n 's/^  - "todo:\(.*\)@\/todo-images:rw"$/\1/p' "${CONFIG}")"
	salt="$(cut -d '$' -f 3 <<<"${hash}")"
	[ "$(printf '%s' "$(env_value DUFS_PASSWORD)" | openssl passwd -6 -salt "${salt}" -stdin)" = "${hash}" ]
}

@test "ro mode omits :rw" {
	run "${SCRIPT}" reader /todo-images ro
	[ "${status}" -eq 0 ]
	grep -q '^  - "reader:.*@/todo-images"$' "${CONFIG}"
}

@test "re-running for an existing login changes nothing" {
	"${SCRIPT}" todo /todo-images
	before="$(cat "${CONFIG}" "${TMP}/.config/dufs/logins/todo.env")"
	run "${SCRIPT}" todo /todo-images
	[ "${status}" -eq 0 ]
	[[ "${output}" == *"already exists"* ]]
	[ "$(cat "${CONFIG}" "${TMP}/.config/dufs/logins/todo.env")" = "${before}" ]
	[ "$(grep -c restart "${TMP}/systemctl.log")" -eq 1 ]
}

@test "--rotate replaces the line and the password" {
	"${SCRIPT}" todo /todo-images
	old="$(env_value DUFS_PASSWORD)"
	run "${SCRIPT}" todo /todo-images --rotate
	[ "${status}" -eq 0 ]
	[ "$(grep -c '^  - "todo:' "${CONFIG}")" -eq 1 ]
	[ "$(env_value DUFS_PASSWORD)" != "${old}" ]
}

@test "an existing login whose env is gone asks for --rotate" {
	"${SCRIPT}" todo /todo-images
	rm "${TMP}/.config/dufs/logins/todo.env"
	run "${SCRIPT}" todo /todo-images
	[ "${status}" -eq 1 ]
	[[ "${output}" == *"--rotate"* ]]
}

@test "a failed scope check restores the config and fails" {
	before="$(cat "${CONFIG}")"
	STUB_OUTSIDE=207 run "${SCRIPT}" todo /todo-images
	[ "${status}" -eq 1 ]
	[[ "${output}" == *"restored"* ]]
	[ "$(cat "${CONFIG}")" = "${before}" ]
	[ ! -e "${TMP}/.config/dufs/logins/todo.env" ]
	[ "$(grep -c restart "${TMP}/systemctl.log")" -eq 2 ]
}

@test "the inside check must be 207" {
	STUB_INSIDE=401 run "${SCRIPT}" todo /todo-images
	[ "${status}" -eq 1 ]
}

@test "rejects bad users, paths and modes" {
	run "${SCRIPT}" Todo /todo-images
	[ "${status}" -eq 1 ]
	run "${SCRIPT}" todo todo-images
	[ "${status}" -eq 1 ]
	run "${SCRIPT}" todo /a/../Keepass
	[ "${status}" -eq 1 ]
	run "${SCRIPT}" todo /todo-images rx
	[ "${status}" -eq 1 ]
	run "${SCRIPT}" todo /todo-images --bogus
	[ "${status}" -eq 1 ]
	run "${SCRIPT}" todo
	[ "${status}" -eq 1 ]
}

@test "refuses a config with no auth entries" {
	sed -i '/^auth:/,$d' "${CONFIG}"
	run "${SCRIPT}" todo /todo-images
	[ "${status}" -eq 1 ]
	[[ "${output}" == *"setup_dufs_cloud.sh"* ]]
}

@test "refuses a missing config" {
	rm "${CONFIG}"
	run "${SCRIPT}" todo /todo-images
	[ "${status}" -eq 1 ]
}

@test "--help prints usage" {
	run "${SCRIPT}" --help
	[ "${status}" -eq 0 ]
	[[ "${output}" == *"Usage: add_dufs_login.sh"* ]]
}
