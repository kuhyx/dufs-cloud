#!/bin/bash
# extract_subtitles.sh — extract embedded text subtitle tracks and their font
# attachments out of videos so the WEB gallery can render them.
#
# Why this exists: browsers cannot demux subtitle tracks out of a Matroska
# file, and <track> only accepts WebVTT — while anime releases ship ASS, whose
# positioning/karaoke/signs do not survive a conversion to VTT. The web client
# therefore renders ASS with libass compiled to WASM (jassub), which needs the
# subtitle file and its fonts as separate HTTP-fetchable artifacts. This script
# produces them offline; nothing is demuxed at request time.
#
# The Flutter app needs none of this — it plays originals through libmpv, which
# has libass built in (see generate_video_proxies.sh for the app-side proxy).
#
# Only TEXT subtitles are extracted (ass/ssa/subrip/webvtt/mov_text). Bitmap
# formats (PGS/VobSub/DVB) are image-compositing pipelines that jassub cannot
# render, so they are deliberately skipped and reported.
#
# Output mirrors `.thumbs/` and `.proxies/`:
#   $CLOUD_ROOT/.subs/<relpath>/NN.<lang>.<ext>   one per subtitle stream
#   $CLOUD_ROOT/.subs/<relpath>/fonts/*.ttf       attached fonts, for libass
#   $CLOUD_ROOT/.subs/<relpath>/tracks.json       index consumed by the SPA
# Idempotent: a video whose tracks.json is newer than the source is skipped.
#
# CLOUD_ROOT comes from the dufs serve-path (~/.config/dufs/dufs.yaml), else
# ~/cloud. Usage: extract_subtitles.sh [ROOT_DIR]

set -euo pipefail

log() { printf '[subtitles] %s\n' "$*" >&2; }

CLOUD_ROOT="${CLOUD_ROOT:-}"
if [[ -z "$CLOUD_ROOT" && -f "$HOME/.config/dufs/dufs.yaml" ]]; then
	CLOUD_ROOT="$(sed -nE 's/^serve-path:[[:space:]]*//p' "$HOME/.config/dufs/dufs.yaml" | head -1)"
fi
CLOUD_ROOT="${CLOUD_ROOT:-$HOME/cloud}"
readonly CLOUD_ROOT
ROOT="${1:-$CLOUD_ROOT}"
readonly ROOT
readonly SUBS="$CLOUD_ROOT/.subs"

FD="$(command -v fd || command -v fdfind || true)"
[[ -n "$FD" ]] || {
	log "ERROR: fd (fd-find) not installed"
	exit 1
}
command -v ffmpeg >/dev/null || {
	log "ERROR: ffmpeg not installed"
	exit 1
}
command -v ffprobe >/dev/null || {
	log "ERROR: ffprobe not installed"
	exit 1
}
command -v jq >/dev/null || {
	log "ERROR: jq not installed"
	exit 1
}

# Containers that can carry embedded subtitle tracks. Matches the video set in
# generate_video_proxies.sh minus the ones that cannot hold subtitles at all.
readonly VID_EXTS=(mkv mp4 mov m4v webm avi ogv mpg mpeg mts m2ts vob)
# Text subtitle codecs libass (via jassub) can render. Anything else is bitmap.
readonly TEXT_SUB_CODECS=(ass ssa subrip srt webvtt mov_text text)

FD_ARGS=()
for e in "${VID_EXTS[@]}"; do FD_ARGS+=(-e "$e"); done

STATE_DIR="${THUMB_STATE:-$HOME/.local/state/media-cloud-sync}"
mkdir -p "$STATE_DIR" "$SUBS"
exec 9>"$STATE_DIR/subtitles.lock"
flock -n 9 || {
	log "another subtitle run is in progress — skipping"
	exit 0
}

readonly REPORT="$STATE_DIR/subtitles-failures.log"
: >"$REPORT"

is_text_sub() {
	local codec="$1"
	for t in "${TEXT_SUB_CODECS[@]}"; do [[ "$codec" == "$t" ]] && return 0; done
	return 1
}

# ASS and SSA keep their own extension so libass parses them as such; every
# other text codec is extracted as SubRip, which libass also reads.
sub_extension() {
	case "$1" in
	ass) printf 'ass' ;;
	ssa) printf 'ssa' ;;
	*) printf 'srt' ;;
	esac
}

# Pull every font attached to the video into <outdir>/fonts. Anime releases
# attach the exact fonts their typesetting references; without them libass
# substitutes and signs render visibly wrong. ffmpeg writes attachments into
# the *current* directory, hence the subshell + cd.
dump_fonts() {
	local src="$1" outdir="$2"
	mkdir -p "$outdir/fonts"
	(
		cd "$outdir/fonts" || exit 1
		# -dump_attachment needs an output that never gets written; -f null
		# with no map reads the file and dumps attachments as a side effect.
		ffmpeg -y -loglevel error -dump_attachment:t "" \
			-i "$src" -f null - </dev/null 2>/dev/null || true
	)
	# Non-font attachments (rare) are not useful to libass.
	find "$outdir/fonts" -type f \
		! -iname '*.ttf' ! -iname '*.otf' ! -iname '*.ttc' \
		-delete 2>/dev/null || true
}

made=0 skipped=0 corrupted=0 failed=0 bitmap=0
while IFS= read -r src; do
	[[ -f "$src" ]] || continue
	rel="${src#"$CLOUD_ROOT"}"
	outdir="$SUBS$rel"
	manifest="$outdir/tracks.json"

	if [[ -f "$manifest" && "$manifest" -nt "$src" ]]; then
		skipped=$((skipped + 1))
		continue
	fi

	if ! probe="$(ffprobe -v error -print_format json \
		-show_entries stream=index,codec_type,codec_name,disposition:stream_tags=language,title \
		"$src" 2>/dev/null)"; then
		log "corrupted, skipping: $src"
		printf '%s\n' "$src" >>"$REPORT"
		corrupted=$((corrupted + 1))
		continue
	fi

	# Subtitle streams only, in stream order, so ffmpeg's -map 0:s:N index
	# matches the position in this list.
	mapfile -t subs < <(jq -c \
		'[.streams[]? | select(.codec_type=="subtitle")] | to_entries[]
		 | {si: .key, codec: .value.codec_name,
		    lang: (.value.tags.language // "und"),
		    title: (.value.tags.title // ""),
		    default: ((.value.disposition.default // 0) == 1)}' \
		<<<"$probe")

	((${#subs[@]})) || {
		skipped=$((skipped + 1))
		continue
	}

	mkdir -p "$outdir"
	entries=() map_args=() any=0
	for entry in "${subs[@]}"; do
		si="$(jq -r '.si' <<<"$entry")"
		codec="$(jq -r '.codec' <<<"$entry")"
		lang="$(jq -r '.lang' <<<"$entry")"

		if ! is_text_sub "$codec"; then
			bitmap=$((bitmap + 1))
			continue
		fi

		ext="$(sub_extension "$codec")"
		file="$(printf '%02d.%s.%s' "$si" "$lang" "$ext")"
		map_args+=(-map "0:s:$si" -c:s copy "$outdir/$file")
		entries+=("$(jq -c --arg f "$file" '. + {file: $f}' <<<"$entry")")
		any=1
	done

	((any)) || {
		skipped=$((skipped + 1))
		continue
	}

	# One ffmpeg pass writing every track, rather than one pass per track:
	# a 17-track release would otherwise be read 17 times.
	if ! ffmpeg -y -loglevel error -i "$src" "${map_args[@]}" </dev/null 2>/dev/null; then
		log "ffmpeg failed (subtitles): $src"
		printf '%s\n' "$src" >>"$REPORT"
		failed=$((failed + 1))
		continue
	fi

	dump_fonts "$src" "$outdir"

	# The SPA hands these to libass; without the release's own faces it
	# substitutes and the typesetting renders visibly wrong. Names only —
	# the client resolves them against <subtitlesPath>/fonts/.
	fonts_json="$(find "$outdir/fonts" -maxdepth 1 -type f -printf '%f\n' 2>/dev/null |
		jq -R -s 'split("\n") | map(select(length > 0))')"

	# tracks.json is written LAST: it is the completion marker the skip check
	# above tests, so a crash mid-extraction retries instead of half-skipping.
	if ! printf '%s\n' "${entries[@]}" | jq -s --argjson fonts "$fonts_json" \
		'{generatedMs: (now * 1000 | floor), fonts: $fonts, tracks: .}' >"$manifest"; then
		log "failed writing manifest: $src"
		printf '%s\n' "$src" >>"$REPORT"
		failed=$((failed + 1))
		continue
	fi
	made=$((made + 1))
done < <("$FD" "${FD_ARGS[@]}" --type f \
	--exclude .thumbs --exclude .proxies --exclude .subs --exclude _thumbs \
	. "$ROOT" 2>/dev/null || true)

log "done: $made extracted, $skipped current/none, $corrupted corrupted, $failed failed → $SUBS"
((bitmap > 0)) && log "$bitmap bitmap subtitle track(s) skipped (not renderable by libass)"
((corrupted > 0 || failed > 0)) && log "see $REPORT for the list"
exit 0
