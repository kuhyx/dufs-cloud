#!/bin/bash
# generate_dash_streams.sh — segment multi-audio videos into DASH so the web
# gallery can offer an AUDIO TRACK PICKER.
#
# Why this exists at all: Chrome does not implement HTMLMediaElement.audioTracks
# (measured on this host — the property is `undefined`), so a plain <video> can
# only ever play the first audio track. A dual-audio release therefore plays its
# English dub with no way to reach the Japanese track.
#
# Why not a second <audio> element playing the other language alongside the
# video: measured, and it fails. Two media elements have two clocks and two
# buffer states; over an uninterrupted stretch they hold ~45 ms apart, but under
# 1.5 Mbps throttling they drifted 8.4 SECONDS and never recovered. This server
# is reachable over the public internet, so that is disqualifying.
#
# What works is Media Source Extensions: ONE media element fed by two
# SourceBuffers, so audio and video share a clock and cannot drift by
# construction. Switching language re-feeds the audio buffer only. MSE needs
# fragmented MP4, and seeking needs a time -> byte map, so the video is written
# as DASH segments plus a manifest whose SegmentTimeline gives exact segment
# durations.
#
# NOTE the two streams are NOT segment-aligned: ffmpeg cuts video at keyframes
# and audio on its own boundaries, so one episode here is 168 video segments and
# 239 audio segments. Segment index N is a DIFFERENT time in each stream, and
# the client must index each stream by its own timeline. Getting this wrong
# hangs playback rather than failing loudly.
#
# Only videos with 2+ audio tracks are segmented: a single-track video has
# nothing to pick between and is served by the ordinary .proxies/ MP4.
#
# Output: $CLOUD_ROOT/.dash/<relpath>/{manifest.mpd,init-stream*.m4s,chunk-*.m4s}
# manifest.mpd is written LAST, as the completion marker.
#
# CLOUD_ROOT comes from the dufs serve-path (~/.config/dufs/dufs.yaml), else
# ~/cloud. Usage: generate_dash_streams.sh [ROOT_DIR]

set -euo pipefail

log() { printf '[dash] %s\n' "$*" >&2; }

# Seconds per segment. 6 s is the usual DASH figure: long enough that a 24 min
# episode is a few hundred files rather than thousands, short enough that a seek
# fetches little wasted data.
readonly SEG_DURATION=6

CLOUD_ROOT="${CLOUD_ROOT:-}"
if [[ -z "$CLOUD_ROOT" && -f "$HOME/.config/dufs/dufs.yaml" ]]; then
	CLOUD_ROOT="$(sed -nE 's/^serve-path:[[:space:]]*//p' "$HOME/.config/dufs/dufs.yaml" | head -1)"
fi
CLOUD_ROOT="${CLOUD_ROOT:-$HOME/cloud}"
readonly CLOUD_ROOT
ROOT="${1:-$CLOUD_ROOT}"
readonly ROOT
readonly DASH="$CLOUD_ROOT/.dash"
readonly PROXIES="$CLOUD_ROOT/.proxies"

FD="$(command -v fd || command -v fdfind || true)"
[[ -n "$FD" ]] || {
	log "ERROR: fd (fd-find) not installed"
	exit 1
}
for tool in ffmpeg ffprobe jq; do
	command -v "$tool" >/dev/null || {
		log "ERROR: $tool not installed"
		exit 1
	}
done

readonly VID_EXTS=(mp4 avi mkv mov wmv flv webm m4v 3gp ogv mpg mpeg mts m2ts vob)
FD_ARGS=()
for e in "${VID_EXTS[@]}"; do FD_ARGS+=(-e "$e"); done

STATE_DIR="${THUMB_STATE:-$HOME/.local/state/media-cloud-sync}"
mkdir -p "$STATE_DIR" "$DASH"
exec 9>"$STATE_DIR/dash-streams.lock"
flock -n 9 || {
	log "another dash run is in progress — skipping"
	exit 0
}

readonly REPORT="$STATE_DIR/dash-streams-failures.log"
: >"$REPORT"

# Segment one video. The video stream comes from the browser-safe proxy when one
# exists (the original may be HEVC, which no browser decodes); audio always
# comes from the ORIGINAL, because the proxy historically kept only one track.
segment_one() {
	local src="$1" outdir="$2" video_src="$3" ntracks="$4"
	local -a maps=(-map "1:v:0")
	local i
	for ((i = 0; i < ntracks; i++)); do maps+=(-map "0:a:$i"); done

	# One AdaptationSet PER audio track, not one holding all of them: DASH
	# treats a set as interchangeable renditions of the same content and keeps
	# only the first one's language, which erased "jpn" from a dual-audio
	# release and left the picker with nothing to label. Stream indices here are
	# output indices — 0 is the video, 1..n the audio tracks in map order.
	local sets="id=0,streams=0"
	for ((i = 1; i <= ntracks; i++)); do sets+=" id=$i,streams=$i"; done

	rm -rf "$outdir.tmp"
	mkdir -p "$outdir.tmp"
	# Stream copy throughout: the proxy is already H.264 and the audio is
	# already AAC, so segmenting is I/O, not an encode (~1 s per episode).
	ffmpeg -y -loglevel error -i "$src" -i "$video_src" "${maps[@]}" \
		-c copy -f dash -seg_duration "$SEG_DURATION" \
		-use_template 1 -use_timeline 1 \
		-adaptation_sets "$sets" \
		"$outdir.tmp/manifest.mpd" </dev/null 2>/dev/null
}

made=0 skipped=0 single=0 failed=0
while IFS= read -r src; do
	[[ -f "$src" ]] || continue
	rel="${src#"$CLOUD_ROOT"}"
	outdir="$DASH$rel"
	manifest="$outdir/manifest.mpd"

	if ! probe="$(ffprobe -v error -print_format json \
		-show_entries stream=codec_type "$src" 2>/dev/null)"; then
		log "corrupted, skipping: $src"
		printf '%s\n' "$src" >>"$REPORT"
		failed=$((failed + 1))
		continue
	fi
	ntracks="$(jq -r '[.streams[]? | select(.codec_type=="audio")] | length' \
		<<<"$probe")"

	# One audio track means nothing to pick between; the plain proxy serves it.
	if [[ "$ntracks" -lt 2 ]]; then
		single=$((single + 1))
		continue
	fi

	# Current only if the manifest is newer than the source AND carries one
	# AdaptationSet per audio track. Manifests from before that fix merged every
	# track into one set and lost all but the first language; a plain mtime
	# check would keep them forever, so the artifact's own shape is the version.
	if [[ -f "$manifest" && "$manifest" -nt "$src" ]] &&
		[[ "$(grep -c 'contentType="audio"' "$manifest" 2>/dev/null || echo 0)" \
			-ge "$ntracks" ]]; then
		skipped=$((skipped + 1))
		continue
	fi

	# Prefer the browser-safe proxy for the video stream; fall back to the
	# original when it needed no proxy (already H.264 in a sane container).
	#
	# The proxy must be COMPLETE, not merely present: generate_video_proxies.sh
	# writes in place, so a concurrent run leaves a growing file whose moov atom
	# does not exist yet. ffprobe rejects exactly those, and skipping the video
	# this round is right — the next run picks it up finished.
	video_src="$PROXIES$rel.mp4"
	if [[ -f "$video_src" ]]; then
		if ! ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
			-of csv=p=0 "$video_src" >/dev/null 2>&1; then
			log "proxy still being written, skipping this run: $src"
			skipped=$((skipped + 1))
			continue
		fi
	else
		video_src="$src"
	fi

	if segment_one "$src" "$outdir" "$video_src" "$ntracks"; then
		rm -rf "$outdir"
		mkdir -p "$(dirname "$outdir")"
		mv "$outdir.tmp" "$outdir"
		made=$((made + 1))
	else
		log "ffmpeg failed: $src"
		printf '%s\n' "$src" >>"$REPORT"
		rm -rf "$outdir.tmp"
		failed=$((failed + 1))
	fi
done < <("$FD" "${FD_ARGS[@]}" --type f \
	--exclude .thumbs --exclude .proxies --exclude .subs --exclude .dash \
	--exclude _thumbs . "$ROOT" 2>/dev/null || true)

log "done: $made segmented, $skipped current, $single single-track, $failed failed → $DASH"
((failed > 0)) && log "see $REPORT for the list"
exit 0
