#!/bin/bash

# ============================================================================
# build_media_index.sh — scan the dufs cloud and write a metadata index that
# the web gallery reads for duration/dimension filtering and time-based sorts.
#
# Output: <cloud>/.meta/index.json
#   { "generatedMs": <epoch ms>,
#     "entries": {
#       "/Media/2025/11/clip.mp4": {
#         "width": 1920, "height": 1080,
#         "durationMs": 92000,
#         "createdMs": <mtime ms>, "uploadedMs": <first-seen ms>,
#         "proxyPath": "/.proxies/Media/2025/11/clip.mp4.mp4",
#         "appProxyPath": null,
#         "subtitlesPath": "/.subs/Media/2025/11/clip.mp4",
#         "dashPath": null
#       }, ... } }
#
# proxyPath is null unless generate_video_proxies.sh has produced a
# browser-safe MP4 for that video (see that script for why). Only the web
# client plays it; the app streams the original so it keeps the embedded
# subtitle tracks the proxy strips.
#
# subtitlesPath is null unless extract_subtitles.sh has pulled that video's
# embedded text subtitle tracks out into <cloud>/.subs/<relpath>/. It points at
# the DIRECTORY; the SPA fetches "<subtitlesPath>/tracks.json" to enumerate the
# tracks and their fonts. This is what lets the browser render ASS at all —
# it cannot demux subtitle streams out of a Matroska file itself.
#
# dashPath is null unless generate_dash_streams.sh has segmented that video,
# which it only does for videos with 2+ audio tracks. It points at the DIRECTORY
# holding manifest.mpd and the segments; the SPA plays those through MSE when it
# wants an audio-track picker, because Chrome does not implement
# HTMLMediaElement.audioTracks and a plain <video> can only reach track one.
#
# Keys are absolute cloud paths (leading slash), matching what the SPA requests.
# Durations/dimensions come from ffprobe; images get dimensions only. The prior
# index (if any) is reused so `uploadedMs` records when a file was FIRST seen.
# Idempotent and safe to re-run (e.g. after each media sync).
#
# Usage: build_media_index.sh [--force]
#
# INCREMENTAL. A file whose mtime still matches the createdMs recorded in the
# prior index keeps its cached width/height/durationMs and is not re-probed, so
# a steady-state run spends no ffprobe/identify calls at all. This matters: the
# media-cloud-sync timer runs this every 30 minutes, and re-probing ~1000 files
# each time cost ~6000 forks per run for an answer that had not changed.
#   --force  re-probe everything (use after an index corruption, or after
#            changing what the probe extracts).
#
# proxyPath is re-tested on EVERY run regardless of the cache: a proxy produced
# later does not touch the source video's mtime, so caching that check would
# pin proxyPath to null forever. The test is a fork-free [[ -f ]].
# ============================================================================

set -euo pipefail

DUFS_YAML="${DUFS_YAML:-$HOME/.config/dufs/dufs.yaml}"
readonly DUFS_YAML

# Implementation lives in lib/. Resolve it through any symlink so the entry
# works when invoked via a link or from another directory.
LIB_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/lib"
readonly LIB_DIR
readonly VIDEO_RE='\.(mp4|mkv|mov|avi|webm|m4v|3gp|ogv|mpg|mpeg|mts|m2ts|vob|wmv|flv)$'
readonly IMAGE_RE='\.(jpg|jpeg|png|gif|bmp|tiff|tif|webp|heic|heif|avif)$'

# shellcheck source=lib/media_index_common.sh
source "$LIB_DIR/media_index_common.sh"
# shellcheck source=lib/media_index_probe.sh
source "$LIB_DIR/media_index_probe.sh"
# shellcheck source=lib/media_index_emit.sh
source "$LIB_DIR/media_index_emit.sh"

TMP_TSV=""
TMP_OUT=""
cleanup() {
    [[ -n "$TMP_TSV" && -f "$TMP_TSV" ]] && rm -f "$TMP_TSV"
    [[ -n "$TMP_OUT" && -f "$TMP_OUT" ]] && rm -f "$TMP_OUT"
    return 0
}
trap cleanup EXIT

main() {
    local force=0
    while (($# > 0)); do
        case "$1" in
            -h | --help)
                # Header block only (everything above `set -euo pipefail`).
                sed '/^set -euo pipefail/q' "$0" | grep -E '^#( |$)' | sed -E 's/^# ?//'
                exit 0
                ;;
            -f | --force)
                force=1
                shift
                ;;
            *) die "unknown option: $1 (see --help)" ;;
        esac
    done

    require_tools
    local root; root="$(cloud_root)"
    [[ -d "$root" ]] || die "cloud root not found: $root"
    local meta_dir="$root/.meta"
    local out="$meta_dir/index.json"
    mkdir -p "$meta_dir"

    local now_ms; now_ms="$(date +%s%3N)"
    load_prior_index "$out"

    collect_media "$root"
    if ((${#media[@]} == 0)); then
        printf '{"generatedMs":%s,"entries":{}}\n' "$now_ms" >"$out"
        OK "no media found under $root → $out"
        return 0
    fi
    load_mtimes

    C "Probing media under $root (excluding .meta, .thumbs, assets)"
    TMP_TSV="$(mktemp)"

    # width/height/dur_ms are assigned by probe_* (dynamic scope); the rest
    # reach emit_row as arguments.
    local i abs kind rel mtime_ms uploaded_ms dur_ms width height
    local probed=0 reused=0
    for i in "${!media[@]}"; do
        abs="${media[$i]}"
        kind="${kinds[$i]}"
        rel="/${abs#"$root"/}"
        [[ "${mtimes[$i]}" != "0" ]] || { WARN "unreadable, skipped: $rel"; continue; }
        mtime_ms=$(( mtimes[i] * 1000 ))

        # Preserve an existing first-seen time, else stamp it now.
        resolve_uploaded_ms "$rel" "$now_ms"
        uploaded_ms="$REPLY"

        dur_ms=null width=null height=null

        if ((force == 0)) && cache_is_fresh "$rel" "$mtime_ms" "$kind"; then
            width="${PRIOR_W[$rel]}"
            height="${PRIOR_H[$rel]}"
            dur_ms="${PRIOR_DUR[$rel]}"
            reused=$((reused + 1))
        elif [[ "$kind" == "video" ]]; then
            probe_video "$abs"
            probed=$((probed + 1))
        else
            probe_image "$abs"
            probed=$((probed + 1))
        fi

        emit_row "$rel" "$kind" "$width" "$height" "$dur_ms" \
            "$mtime_ms" "$uploaded_ms" "$root"
    done

    write_index_json "$meta_dir" "$now_ms" "$out"
    OK "indexed $((probed + reused)) media file(s) ($probed probed, $reused cached) → $out"
}

main "$@"
