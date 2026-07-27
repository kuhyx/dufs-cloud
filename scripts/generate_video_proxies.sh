#!/bin/bash
# generate_video_proxies.sh — generate browser-safe MP4 proxies for videos
# that would otherwise fail to play in the web gallery: browsers cannot
# reliably play arbitrary MKV/AVI/etc. *containers* via <video> even when the
# codecs inside are fine, and they do not decode AC3/DTS-family audio (common
# in videos muxed for TVs/home theatre — e.g. Google Drive phone backups with
# AC3 audio).
#
# These are for the WEB client only. The Flutter app plays the original file
# via libmpv, which handles those containers and codecs natively — and must,
# because the proxy below maps only the first video and audio stream, so every
# embedded subtitle track is dropped from it.
#
# Tier 1 (default, cheap): for videos whose audio codec is in a known-broken
# set, remux to MP4 copying the video stream as-is and transcoding ONLY the
# audio track to AAC. No video re-encode, so this stays fast at scale.
#
# Tier 2 (--force-remux-container, opt-in): also container-remux videos
# whose audio/video codecs are already fine but whose raw non-mp4/webm
# container might still not play in some browsers. Still stream-copy only
# (no re-encode) — just widens the container-safety net. Not run by default
# because it would touch every non-mp4/webm video in the library.
#
# Corrupted/unreadable files (ffprobe exits non-zero) are logged and
# skipped — no proxy can fix a bad download.
#
# Output mirrors `.thumbs/`: $CLOUD_ROOT/.proxies/<relpath>.mp4
# (idempotent: skipped if the proxy is newer than the source).
#
# CLOUD_ROOT comes from the dufs serve-path (~/.config/dufs/dufs.yaml), else
# ~/cloud. Usage: generate_video_proxies.sh [--force-remux-container] [ROOT_DIR]

set -euo pipefail

log() { printf '[video-proxies] %s\n' "$*" >&2; }

FORCE_REMUX=0
ROOT_ARG=""
for arg in "$@"; do
	case "$arg" in
	--force-remux-container) FORCE_REMUX=1 ;;
	*) ROOT_ARG="$arg" ;;
	esac
done
readonly FORCE_REMUX

CLOUD_ROOT="${CLOUD_ROOT:-}"
if [[ -z "$CLOUD_ROOT" && -f "$HOME/.config/dufs/dufs.yaml" ]]; then
	CLOUD_ROOT="$(sed -nE 's/^serve-path:[[:space:]]*//p' "$HOME/.config/dufs/dufs.yaml" | head -1)"
fi
CLOUD_ROOT="${CLOUD_ROOT:-$HOME/cloud}"
ROOT="${ROOT_ARG:-$CLOUD_ROOT}"
readonly PROXIES="$CLOUD_ROOT/.proxies"

FD="$(command -v fd || command -v fdfind || true)"
[[ -n "$FD" ]] || { log "ERROR: fd (fd-find) not installed"; exit 1; }
command -v ffmpeg >/dev/null || { log "ERROR: ffmpeg not installed"; exit 1; }
command -v ffprobe >/dev/null || { log "ERROR: ffprobe not installed"; exit 1; }
command -v jq >/dev/null || { log "ERROR: jq not installed"; exit 1; }

readonly VID_EXTS=(mp4 avi mkv mov wmv flv webm m4v 3gp ogv mpg mpeg mts m2ts vob)
readonly SAFE_CONTAINER_EXTS=(mp4 webm)
readonly BAD_AUDIO_CODECS=(ac3 eac3 dts dts-hd truehd mp2)
FD_ARGS=()
for e in "${VID_EXTS[@]}"; do FD_ARGS+=(-e "$e"); done

STATE_DIR="${THUMB_STATE:-$HOME/.local/state/media-cloud-sync}"
mkdir -p "$STATE_DIR" "$PROXIES"
exec 9>"$STATE_DIR/video-proxies.lock"
flock -n 9 || { log "another video-proxy run is in progress — skipping"; exit 0; }

readonly REPORT="$STATE_DIR/video-proxies-failures.log"
: >"$REPORT"

is_safe_container() {
	local ext="${1##*.}"
	ext="${ext,,}"
	for s in "${SAFE_CONTAINER_EXTS[@]}"; do [[ "$ext" == "$s" ]] && return 0; done
	return 1
}

is_bad_audio() {
	local codec="$1"
	for b in "${BAD_AUDIO_CODECS[@]}"; do [[ "$codec" == "$b" ]] && return 0; done
	return 1
}

made=0 skipped=0 corrupted=0 failed=0
while IFS= read -r src; do
	[[ -f "$src" ]] || continue
	rel="${src#"$CLOUD_ROOT"}"
	dst="$PROXIES${rel}.mp4"
	if [[ -f "$dst" && "$dst" -nt "$src" ]]; then
		skipped=$((skipped + 1))
		continue
	fi

	if ! probe="$(ffprobe -v error -print_format json \
		-show_entries stream=codec_type,codec_name \
		"$src" 2>/dev/null)"; then
		log "corrupted, skipping: $src"
		printf '%s\n' "$src" >>"$REPORT"
		corrupted=$((corrupted + 1))
		continue
	fi

	audio_codec="$(jq -r \
		'[.streams[]? | select(.codec_type=="audio") | .codec_name][0] // empty' \
		<<<"$probe")"

	needs_proxy=0
	audio_args=(-c:a copy)
	if [[ -n "$audio_codec" ]] && is_bad_audio "$audio_codec"; then
		needs_proxy=1
		audio_args=(-c:a aac -b:a 192k)
	elif ((FORCE_REMUX)) && ! is_safe_container "$src"; then
		needs_proxy=1
	fi
	if ((!needs_proxy)); then
		skipped=$((skipped + 1))
		continue
	fi

	mkdir -p "$(dirname "$dst")"
	if ffmpeg -y -loglevel error -i "$src" -map 0:v:0 -map 0:a:0? \
		-c:v copy "${audio_args[@]}" -movflags +faststart \
		"$dst" </dev/null 2>/dev/null; then
		made=$((made + 1))
	else
		log "ffmpeg failed: $src"
		printf '%s\n' "$src" >>"$REPORT"
		failed=$((failed + 1))
	fi
done < <("$FD" "${FD_ARGS[@]}" --type f \
	--exclude .thumbs --exclude .proxies --exclude _thumbs \
	. "$ROOT" 2>/dev/null || true)

log "done: $made made, $skipped current/skipped, $corrupted corrupted, $failed failed → $PROXIES"
((corrupted > 0 || failed > 0)) && log "see $REPORT for the list"
exit 0
