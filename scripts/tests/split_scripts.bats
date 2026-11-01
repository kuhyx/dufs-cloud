#!/usr/bin/env bats
# Guards the lib/ split of setup_dufs_cloud.sh and build_media_index.sh: each
# thin entry script must still source its libs, print its header as --help and
# work through a symlink. setup_dufs_cloud.sh sources ../../lib/common.sh from
# the host repo, so a stub common.sh is staged next to a copy of the scripts;
# only --help is run, never the real setup.

SCRIPTS="${BATS_TEST_DIRNAME}/.."

setup() {
	TMP="$(mktemp -d)"
	mkdir -p "${TMP}/lib" "${TMP}/proj"
	cp -r "${SCRIPTS}" "${TMP}/proj/scripts"
	cat >"${TMP}/lib/common.sh" <<'EOS'
get_actual_user() { echo stub; }
print_setup_header() { :; }
log_info() { :; }; log_ok() { :; }; log_warn() { :; }; log_error() { :; }
EOS
}

teardown() {
	rm -rf "${TMP}"
}

@test "entry scripts source every lib they ship" {
	for pair in setup_dufs_cloud.sh:dufs_ build_media_index.sh:media_index_; do
		entry="${pair%%:*}"
		prefix="${pair##*:}"
		for lib in "${SCRIPTS}"/lib/"${prefix}"*.sh; do
			grep -q "lib/$(basename "${lib}")" "${SCRIPTS}/${entry}"
		done
	done
}

@test "every split file stays within 250 lines" {
	for f in setup_dufs_cloud.sh build_media_index.sh lib/*.sh; do
		[[ $(wc -l <"${SCRIPTS}/${f}") -le 250 ]]
	done
}

@test "setup_dufs_cloud.sh --help prints its header" {
	run bash "${TMP}/proj/scripts/setup_dufs_cloud.sh" --help
	[[ "${status}" -eq 0 ]]
	[[ "${output}" == *'Self-hosted "cloud" storage (dufs)'* ]]
	[[ "${output}" == *"Usage:"* ]]
}

@test "setup_dufs_cloud.sh --help works through a symlink" {
	ln -s "${TMP}/proj/scripts/setup_dufs_cloud.sh" "${TMP}/link.sh"
	run bash "${TMP}/link.sh" -h
	[[ "${status}" -eq 0 ]]
	[[ "${output}" == *"Install / update everything"* ]]
}

@test "build_media_index.sh --help prints its header" {
	run bash "${SCRIPTS}/build_media_index.sh" --help
	[[ "${status}" -eq 0 ]]
	[[ "${output}" == *"build_media_index.sh — scan the dufs cloud"* ]]
	[[ "${output}" == *"--force"* ]]
}

@test "build_media_index.sh loads its libs through a symlink" {
	ln -s "${SCRIPTS}/build_media_index.sh" "${TMP}/idx.sh"
	run bash "${TMP}/idx.sh" --bogus
	[[ "${status}" -eq 1 ]]
	[[ "${output}" == *"unknown option: --bogus"* ]]
}
