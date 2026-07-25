#!/bin/bash
# generate_thumbnails.sh — make small preview thumbnails for the cloud media so
# the web gallery (cloud_gallery) loads fast instead of downloading full files.
#
# For every image/video under the dufs cloud it writes a ~400px JPEG to
#   $CLOUD_ROOT/.thumbs/<same-path>.jpg
# which the gallery requests as `/.thumbs/<path>.jpg`. Images are resized with
# ImageMagick; videos get a poster frame via ffmpeg. Idempotent: a thumbnail
# newer than its source is skipped. flock-guarded, self-contained.
#
# FAILURE MEMORY. A source that cannot be thumbnailed (e.g. a .wmv that is an
# audio-only ASF container — no video stream to grab a frame from) leaves no
# output, so the "is the thumbnail newer than the source" test can never skip
# it and the run retries it forever. Failures are therefore recorded in
#   $STATE_DIR/thumb-failures.tsv   (rel <TAB> source-mtime <TAB> reason)
# and skipped while the source is unchanged; touching or replacing the file
# clears the entry and retries it. Entries for vanished files are pruned each
# run. Delete the file to force a full retry.
#
# A NEWLY failing file is reported to stderr with systemd's <3> (error)
# priority prefix so it lands in `journalctl -p err` instead of being counted
# into a log line nobody reads, and the script exits non-zero.
#
# CLOUD_ROOT comes from the dufs serve-path (~/.config/dufs/dufs.yaml), else
# ~/cloud. Usage: generate_thumbnails.sh [ROOT_DIR]

set -euo pipefail

readonly THUMB_MAX=400

log() { printf '[thumbnails] %s\n' "$*" >&2; }
# <3> is systemd's SyslogLevelPrefix for LOG_ERR; harmless when run from a tty.
err_log() { printf '<3>[thumbnails] %s\n' "$*" >&2; }

CLOUD_ROOT="${CLOUD_ROOT:-}"
if [[ -z "$CLOUD_ROOT" && -f "$HOME/.config/dufs/dufs.yaml" ]]; then
	CLOUD_ROOT="$(sed -nE 's/^serve-path:[[:space:]]*//p' "$HOME/.config/dufs/dufs.yaml" | head -1)"
fi
CLOUD_ROOT="${CLOUD_ROOT:-$HOME/cloud}"
ROOT="${1:-$CLOUD_ROOT}"
readonly THUMBS="$CLOUD_ROOT/.thumbs"

FD="$(command -v fd || command -v fdfind || true)"
[[ -n "$FD" ]] || { log "ERROR: fd (fd-find) not installed"; exit 1; }
command -v ffmpeg >/dev/null || { log "ERROR: ffmpeg not installed"; exit 1; }
MAGICK="$(command -v magick || command -v convert || true)"
[[ -n "$MAGICK" ]] || { log "ERROR: ImageMagick (magick/convert) not installed"; exit 1; }

readonly IMG_EXTS=(jpg jpeg png gif bmp tiff tif webp heic heif avif)
readonly VID_EXTS=(mp4 avi mkv mov wmv flv webm m4v 3gp ogv mpg mpeg mts m2ts vob)
FD_ARGS=()
for e in "${IMG_EXTS[@]}" "${VID_EXTS[@]}"; do FD_ARGS+=(-e "$e"); done

STATE_DIR="${THUMB_STATE:-$HOME/.local/state/media-cloud-sync}"
mkdir -p "$STATE_DIR" "$THUMBS"
readonly FAIL_DB="$STATE_DIR/thumb-failures.tsv"
exec 9>"$STATE_DIR/thumbs.lock"
flock -n 9 || { log "another thumbnail run is in progress — skipping"; exit 0; }

is_video() {
	local ext="${1##*.}"
	ext="${ext,,}"
	for v in "${VID_EXTS[@]}"; do [[ "$ext" == "$v" ]] && return 0; done
	return 1
}

# Known failures from previous runs, keyed by cloud-relative path.
declare -A FAIL_MTIME=() FAIL_REASON=()
if [[ -f "$FAIL_DB" ]]; then
	while IFS=$'\t' read -r f_rel f_mtime f_reason; do
		[[ -n "$f_rel" ]] || continue
		FAIL_MTIME["$f_rel"]="$f_mtime"
		FAIL_REASON["$f_rel"]="$f_reason"
	done < "$FAIL_DB"
fi

# Failures still true at the end of this run, rewritten over FAIL_DB. Starting
# empty is what prunes entries whose source has since been deleted.
declare -A KEEP_MTIME=() KEEP_REASON=()

THUMB_ERR=""

# Try both poster-frame strategies; leaves the reason in THUMB_ERR on failure.
video_thumb() {
	local src="$1" dst="$2"
	if THUMB_ERR="$(ffmpeg -y -loglevel error -ss 1 -i "$src" -frames:v 1 \
		-vf "scale=${THUMB_MAX}:-2:force_original_aspect_ratio=decrease" \
		"$dst" </dev/null 2>&1 >/dev/null)"; then
		return 0
	fi
	# Fall back to the very first frame (videos shorter than 1s).
	if THUMB_ERR="$(ffmpeg -y -loglevel error -i "$src" -frames:v 1 \
		-vf "scale=${THUMB_MAX}:-2" "$dst" </dev/null 2>&1 >/dev/null)"; then
		return 0
	fi
	return 1
}

image_thumb() {
	local src="$1" dst="$2"
	THUMB_ERR="$("$MAGICK" "${src}[0]" -auto-orient \
		-thumbnail "${THUMB_MAX}x${THUMB_MAX}>" -strip "$dst" 2>&1 >/dev/null)" ||
		return 1
	return 0
}

# Collapse a tool's stderr to one TSV-safe line.
first_line() {
	local s="${1%%$'\n'*}"
	s="${s//$'\t'/ }"
	printf '%s' "${s:-unknown error}"
}

made=0 skipped=0 known=0 newly=0
declare -a NEW_FAILURES=()

# Pass 1 — triage with no forks at all. "Thumbnail newer than source" is a
# shell file test, so a healthy library never gets past this point.
declare -a CAND=() CAND_REL=()
while IFS= read -r src; do
	[[ -f "$src" ]] || continue
	# Thumbnail path mirrors the file's path under the cloud root.
	rel="${src#"$CLOUD_ROOT"}"
	dst="$THUMBS${rel}.jpg"
	if [[ -f "$dst" && "$dst" -nt "$src" ]]; then
		skipped=$((skipped + 1)); continue
	fi
	CAND+=("$src"); CAND_REL+=("$rel")
done < <("$FD" "${FD_ARGS[@]}" --type f --exclude '.thumbs' --exclude '_thumbs' --exclude '.proxies' . "$ROOT" 2>/dev/null || true)

# One batched stat for every candidate, so recognising known-bad files costs a
# constant two forks rather than one per broken file. Output is one line per
# argument in order, so no filename parsing is involved.
declare -a CAND_MTIME=()
if ((${#CAND[@]} > 0)); then
	mapfile -t CAND_MTIME < <(printf '%s\0' "${CAND[@]}" |
		xargs -0 -r stat --printf '%Y\n' 2>/dev/null || true)
	if ((${#CAND_MTIME[@]} != ${#CAND[@]})); then
		# A file vanished mid-scan and the batched output no longer lines up.
		CAND_MTIME=()
		for src in "${CAND[@]}"; do
			CAND_MTIME+=("$(stat -c %Y "$src" 2>/dev/null || echo 0)")
		done
	fi
fi

# Pass 2 — only files that actually need work.
for i in "${!CAND[@]}"; do
	src="${CAND[$i]}"
	rel="${CAND_REL[$i]}"
	dst="$THUMBS${rel}.jpg"
	src_mtime="${CAND_MTIME[$i]}"

	if [[ "${FAIL_MTIME[$rel]:-}" == "$src_mtime" ]]; then
		KEEP_MTIME["$rel"]="$src_mtime"
		KEEP_REASON["$rel"]="${FAIL_REASON[$rel]}"
		known=$((known + 1)); continue
	fi

	mkdir -p "$(dirname "$dst")"
	if is_video "$src"; then
		video_thumb "$src" "$dst" && ok=1 || ok=0
	else
		image_thumb "$src" "$dst" && ok=1 || ok=0
	fi

	if ((ok == 1)); then
		made=$((made + 1))
		continue
	fi

	# A failed run can leave a truncated output behind; removing it keeps the
	# "thumbnail newer than source" test from later mistaking it for success.
	rm -f "$dst"
	newly=$((newly + 1))
	reason="$(first_line "$THUMB_ERR")"
	if [[ "$rel" == *$'\t'* || "$rel" == *$'\n'* ]]; then
		err_log "cannot record failure for path with tab/newline: ${rel@Q}"
	else
		KEEP_MTIME["$rel"]="$src_mtime"
		KEEP_REASON["$rel"]="$reason"
	fi
	NEW_FAILURES+=("$rel — $reason")
done

# Rewrite the failure DB from what is still true (this prunes deleted files).
: > "$FAIL_DB"
for rel in "${!KEEP_MTIME[@]}"; do
	printf '%s\t%s\t%s\n' "$rel" "${KEEP_MTIME[$rel]}" "${KEEP_REASON[$rel]}" >> "$FAIL_DB"
done

log "done: $made made, $skipped current, $newly newly-failed, $known known-failed → $THUMBS"

if ((newly > 0)); then
	err_log "$newly source(s) newly failed to thumbnail:"
	for f in "${NEW_FAILURES[@]}"; do err_log "  $f"; done
	err_log "recorded in $FAIL_DB; they will be retried when the source changes"
	exit 1
fi
