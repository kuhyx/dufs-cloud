#!/usr/bin/env bats
# Tests for scripts/deploy.sh. pnpm, systemctl, curl, adb and phone_deploy are
# stubbed on PATH so this runs in CI without dufs, node or a phone; the real
# path is the `- deploy:` line in CLAUDE.md, run by hand and by Ship.

SRC="${BATS_TEST_DIRNAME}/../deploy.sh"

setup() {
	TMP="$(mktemp -d)"
	export HOME="${TMP}"
	REPO="${TMP}/repo"
	CLOUD="${TMP}/cloud"
	mkdir -p "${REPO}/scripts" "${REPO}/web" "${REPO}/app" "${CLOUD}" \
		"${TMP}/.config/dufs" "${TMP}/bin"
	cp "${SRC}" "${REPO}/scripts/deploy.sh"
	mkdir -p "${REPO}/.github/workflows" "${TMP}/sysbin"
	printf '          node-version: "26.13.0"\n' >"${REPO}/.github/workflows/ci.yml"
	printf 'serve-path: %s\nport: 5000\n' "${CLOUD}" >"${TMP}/.config/dufs/dufs.yaml"
	printf 'old-ui\n' >"${CLOUD}/index.html"

	# Ship's PATH puts an old nvm node first; the system one matches CI's pin.
	printf '#!/bin/bash\necho v22.18.0\n' >"${TMP}/bin/node"
	printf '#!/bin/bash\necho %s\n' "${STUB_SYS_NODE:-v26.13.0}" >"${TMP}/sysbin/node"
	chmod +x "${TMP}/sysbin/node"
	export NODE_BIN_DIR="${TMP}/sysbin"
	# pnpm "build" writes a dist with one asset, or fails on STUB_BUILD_FAIL or
	# when the node it finds is older than Astro's floor (as the real one does).
	cat >"${TMP}/bin/pnpm" <<'EOF'
#!/bin/bash
[[ " $* " == *" build "* ]] || exit 0
[[ -z ${STUB_BUILD_FAIL:-} ]] || exit 1
[[ $(node -v) == v26.* ]] || { echo "Node.js $(node -v) is not supported by Astro!"; exit 1; }
dist="$2/dist"
mkdir -p "$dist/assets"
printf '<script src="/assets/app.js"></script>\n' >"$dist/index.html"
printf 'js\n' >"$dist/assets/app.js"
EOF
	cat >"${TMP}/bin/systemctl" <<'EOF'
#!/bin/bash
[[ -z ${STUB_DUFS_DOWN:-} ]]
EOF
	cat >"${TMP}/bin/curl" <<'EOF'
#!/bin/bash
printf '%s' "${STUB_HTTP:-401}"
EOF
	# adb: `date` gives the deploy start, dumpsys the install time, pidof the pid.
	cat >"${TMP}/bin/adb" <<'EOF'
#!/bin/bash
case "$*" in
	*" date "*) echo "2026-11-11 15:00:00" ;;
	*dumpsys*) echo "    lastUpdateTime=${STUB_UPDATED:-2026-11-11 15:02:00}" ;;
	*pidof*) [[ -n ${STUB_NOT_RUNNING:-} ]] || echo 4242 ;;
esac
EOF
	cat >"${TMP}/bin/phone_deploy" <<'EOF'
#!/bin/bash
echo "$*" >>"${HOME}/phone_deploy.log"
exit "${STUB_PHONE_RC:-0}"
EOF
	chmod +x "${TMP}/bin/"*
	export PATH="${TMP}/bin:${PATH}"
	export PHONE_DEPLOY="${TMP}/bin/phone_deploy"
}

teardown() {
	rm -rf "${TMP}"
}

@test "web: builds, copies into the cloud root and passes its check" {
	run bash "${REPO}/scripts/deploy.sh" web
	[ "$status" -eq 0 ]
	grep -q 'assets/app.js' "${CLOUD}/index.html"
	[ -f "${CLOUD}/assets/app.js" ]
}

@test "web: a second run is a no-op that still passes" {
	bash "${REPO}/scripts/deploy.sh" web
	first="$(sha256sum "${CLOUD}/index.html" "${CLOUD}/assets/app.js")"
	run bash "${REPO}/scripts/deploy.sh" web
	[ "$status" -eq 0 ]
	[ "$(sha256sum "${CLOUD}/index.html" "${CLOUD}/assets/app.js")" = "${first}" ]
}

@test "web: a failed build leaves the live UI alone and fails" {
	STUB_BUILD_FAIL=1 run bash "${REPO}/scripts/deploy.sh" web
	[ "$status" -ne 0 ]
	grep -q old-ui "${CLOUD}/index.html"
}

@test "web: builds with the CI-pinned node, not the first one on PATH" {
	run bash "${REPO}/scripts/deploy.sh" web
	[ "$status" -eq 0 ]
}

@test "web: a system node older than CI's pin fails before the build" {
	printf '#!/bin/bash\necho v24.18.0\n' >"${TMP}/sysbin/node"
	run bash "${REPO}/scripts/deploy.sh" web
	[ "$status" -ne 0 ]
	[[ $output == *"node v24.18.0"*"26"* ]]
	grep -q old-ui "${CLOUD}/index.html"
}

@test "web: dufs.service down fails the deploy" {
	STUB_DUFS_DOWN=1 run bash "${REPO}/scripts/deploy.sh" web
	[ "$status" -ne 0 ]
}

@test "web: dufs answering 502 fails the deploy" {
	STUB_HTTP=502 run bash "${REPO}/scripts/deploy.sh" web
	[ "$status" -ne 0 ]
}

@test "phone: release build via phone_deploy, never an uninstall" {
	run bash "${REPO}/scripts/deploy.sh" phone
	[ "$status" -eq 0 ]
	grep -q "${REPO}/app --release" "${HOME}/phone_deploy.log"
}

@test "phone: an unreachable phone fails the deploy" {
	STUB_PHONE_RC=30 run bash "${REPO}/scripts/deploy.sh" phone
	[ "$status" -ne 0 ]
}

@test "phone: an install older than the run fails the deploy" {
	STUB_UPDATED="2026-11-02 21:15:30" run bash "${REPO}/scripts/deploy.sh" phone
	[ "$status" -ne 0 ]
}

@test "phone: the app not running after launch fails the deploy" {
	STUB_NOT_RUNNING=1 run bash "${REPO}/scripts/deploy.sh" phone
	[ "$status" -ne 0 ]
}

@test "all: runs web then phone" {
	run bash "${REPO}/scripts/deploy.sh"
	[ "$status" -eq 0 ]
	[ -f "${CLOUD}/assets/app.js" ]
	[ -f "${HOME}/phone_deploy.log" ]
}

@test "an unknown target is a usage error" {
	run bash "${REPO}/scripts/deploy.sh" bogus
	[ "$status" -eq 2 ]
}

@test "all: a failed web check stops before the phone" {
	STUB_DUFS_DOWN=1 run bash "${REPO}/scripts/deploy.sh"
	[ "$status" -ne 0 ]
	[ ! -f "${HOME}/phone_deploy.log" ]
}
