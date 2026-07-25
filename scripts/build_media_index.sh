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
#         "proxyPath": "/.proxies/Media/2025/11/clip.mp4.mp4"
#       }, ... } }
#
# proxyPath is null unless generate_video_proxies.sh has produced a
# browser/ExoPlayer-safe MP4 for that video (see that script for why); both
# clients play the proxy in preference to the original when it is set.
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

C() { printf '\033[1;34m[media-index]\033[0m %s\n' "$*"; }
OK() { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
WARN() { printf '\033[1;33m[media-index] WARN:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[media-index] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

TMP_TSV=""
TMP_OUT=""
cleanup() {
    [[ -n "$TMP_TSV" && -f "$TMP_TSV" ]] && rm -f "$TMP_TSV"
    [[ -n "$TMP_OUT" && -f "$TMP_OUT" ]] && rm -f "$TMP_OUT"
    return 0
}
trap cleanup EXIT

# Resolve the dufs serve path (the cloud root) from its config, else default.
cloud_root() {
    local sp=""
    [[ -f "$DUFS_YAML" ]] &&
        sp="$(sed -nE 's/^serve-path:[[:space:]]*//p' "$DUFS_YAML" | head -1)"
    printf '%s' "${sp:-$HOME/cloud}"
}

require_tools() {
    local missing=()
    command -v ffprobe >/dev/null || missing+=(ffmpeg)
    command -v jq >/dev/null || missing+=(jq)
    command -v fd >/dev/null || missing+=(fd)
    command -v identify >/dev/null || missing+=(imagemagick)
    if ((${#missing[@]} > 0)); then
        command -v pacman >/dev/null ||
            die "missing: ${missing[*]} (install them and re-run)"
        C "Installing: ${missing[*]}"
        sudo pacman -S --needed --noconfirm "${missing[@]}"
    fi
}

readonly VIDEO_RE='\.(mp4|mkv|mov|avi|webm|m4v|3gp|ogv|mpg|mpeg|mts|m2ts|vob|wmv|flv)$'
readonly IMAGE_RE='\.(jpg|jpeg|png|gif|bmp|tiff|tif|webp|heic|heif|avif)$'

# Prior-index lookup tables, keyed by the entry's cloud path.
declare -A PRIOR_CREATED PRIOR_UPLOADED PRIOR_W PRIOR_H PRIOR_DUR

# Read the whole prior index in ONE jq call instead of one per file. A key
# containing a tab or newline comes back escaped by @tsv and therefore fails to
# match its real path — such a file simply misses the cache and is re-probed,
# so correctness is preserved either way.
load_prior_index() {
    local index="$1" k c u w h d
    [[ -f "$index" ]] || return 0
    while IFS=$'\t' read -r k c u w h d; do
        [[ -n "$k" ]] || continue
        PRIOR_CREATED["$k"]="$c"
        PRIOR_UPLOADED["$k"]="$u"
        PRIOR_W["$k"]="$w"
        PRIOR_H["$k"]="$h"
        PRIOR_DUR["$k"]="$d"
    done < <(jq --raw-output '
        (.entries // {}) | to_entries[] |
        [ .key,
          (.value.createdMs  // "null"),
          (.value.uploadedMs // "null"),
          (.value.width      // "null"),
          (.value.height     // "null"),
          (.value.durationMs // "null") ] | @tsv' "$index" 2>/dev/null || true)
}

# A cached entry is usable when the file has not been modified since it was
# indexed and the cached geometry is actually present (a prior probe failure
# stored nulls, and should be retried rather than cached forever).
cache_is_fresh() {
    local rel="$1" mtime_ms="$2" kind="$3"
    [[ -n "${PRIOR_CREATED[$rel]:-}" ]] || return 1
    [[ "${PRIOR_CREATED[$rel]}" == "$mtime_ms" ]] || return 1
    [[ "${PRIOR_W[$rel]:-null}" != "null" && "${PRIOR_H[$rel]:-null}" != "null" ]] || return 1
    # Videos additionally need a duration; images legitimately have none.
    [[ "$kind" != "video" || "${PRIOR_DUR[$rel]:-null}" != "null" ]]
}

main() {
    local force=0
    while (($# > 0)); do
        case "$1" in
            -h | --help)
                grep -E '^#( |$)' "$0" | sed -E 's/^# ?//'
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

    # Collect the file list once; fd already prunes the dirs we never index.
    local -a all=()
    mapfile -d '' -t all < <(fd --type f --absolute-path \
        --exclude .meta --exclude .thumbs --exclude _thumbs --exclude assets \
        --exclude .proxies \
        . "$root" --print0)

    # Keep only media, and drop paths that would corrupt the TSV hand-off
    # below. (A tab or newline in a media filename is pathological; skipping
    # it loudly beats silently mangling the index.)
    local -a media=() kinds=()
    local abs kind
    for abs in "${all[@]}"; do
        if [[ "$abs" =~ $VIDEO_RE ]]; then kind="video"
        elif [[ "$abs" =~ $IMAGE_RE ]]; then kind="image"
        else continue; fi
        if [[ "$abs" == *$'\t'* || "$abs" == *$'\n'* ]]; then
            WARN "skipping path with tab/newline: ${abs@Q}"
            continue
        fi
        media+=("$abs")
        kinds+=("$kind")
    done

    if ((${#media[@]} == 0)); then
        printf '{"generatedMs":%s,"entries":{}}\n' "$now_ms" >"$out"
        OK "no media found under $root → $out"
        return 0
    fi

    # One batched stat for every mtime, instead of one fork per file. Output is
    # one line per argument in order, so no filename parsing is needed. xargs
    # keeps this safe if the library ever outgrows ARG_MAX.
    local -a mtimes=()
    mapfile -t mtimes < <(printf '%s\0' "${media[@]}" |
        xargs -0 -r stat --printf '%Y\n' 2>/dev/null || true)
    if ((${#mtimes[@]} != ${#media[@]})); then
        # A file vanished mid-scan, so the batched output no longer lines up
        # with the input. Fall back to per-file stat rather than misattribute.
        WARN "file list changed during scan — falling back to per-file stat"
        mtimes=()
        for abs in "${media[@]}"; do
            mtimes+=("$(stat -c %Y "$abs" 2>/dev/null || echo 0)")
        done
    fi

    C "Probing media under $root (excluding .meta, .thumbs, assets)"
    TMP_TSV="$(mktemp)"

    local i rel mtime_ms uploaded_ms dur_ms width height proxy_rel probe
    local probed=0 reused=0
    for i in "${!media[@]}"; do
        abs="${media[$i]}"
        kind="${kinds[$i]}"
        rel="/${abs#"$root"/}"
        [[ "${mtimes[$i]}" != "0" ]] || { WARN "unreadable, skipped: $rel"; continue; }
        mtime_ms=$(( mtimes[i] * 1000 ))

        # Preserve an existing first-seen time, else stamp it now.
        uploaded_ms="${PRIOR_UPLOADED[$rel]:-}"
        [[ -n "$uploaded_ms" && "$uploaded_ms" != "null" ]] || uploaded_ms="$now_ms"

        dur_ms=null width=null height=null

        if ((force == 0)) && cache_is_fresh "$rel" "$mtime_ms" "$kind"; then
            width="${PRIOR_W[$rel]}"
            height="${PRIOR_H[$rel]}"
            dur_ms="${PRIOR_DUR[$rel]}"
            reused=$((reused + 1))
        elif [[ "$kind" == "video" ]]; then
            probe="$(ffprobe -v quiet -print_format json \
                -show_entries format=duration:stream=width,height \
                -select_streams v:0 "$abs" 2>/dev/null || true)"
            if [[ -n "$probe" ]]; then
                # One jq emits all three values; splitting them into three
                # calls was three forks per video for no benefit.
                IFS=$'\t' read -r dur_ms width height < <(jq --raw-output '
                    [ ((.format.duration // 0) | tonumber * 1000 | floor),
                      (.streams[0].width  // "null"),
                      (.streams[0].height // "null") ] | @tsv' \
                    <<<"$probe" 2>/dev/null || printf 'null\tnull\tnull')
                : "${dur_ms:=null}" "${width:=null}" "${height:=null}"
            fi
            probed=$((probed + 1))
        else
            # ImageMagick is authoritative for image dimensions (ffprobe is
            # unreliable on stills); [0] takes the first frame of multi-frame
            # images (e.g. GIFs) so the geometry is a single "W H".
            local dims; dims="$(identify -format '%w %h' "${abs}[0]" 2>/dev/null || true)"
            if [[ "$dims" =~ ^([0-9]+)\ ([0-9]+)$ ]]; then
                width="${BASH_REMATCH[1]}"
                height="${BASH_REMATCH[2]}"
            fi
            probed=$((probed + 1))
        fi

        # Deliberately OUTSIDE the cache branch: generate_video_proxies.sh can
        # add a proxy long after the source file was last modified, so this
        # must be re-tested every run. It is a fork-free file test.
        proxy_rel=""
        [[ "$kind" == "video" && -f "$root/.proxies$rel.mp4" ]] &&
            proxy_rel="/.proxies$rel.mp4"

        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
            "$rel" "$width" "$height" "$dur_ms" \
            "$mtime_ms" "$uploaded_ms" "$proxy_rel" >>"$TMP_TSV"
    done

    # One jq builds the whole document. The previous version re-serialised the
    # entire growing index once per file, which is O(n²) writes.
    TMP_OUT="$(mktemp -p "$meta_dir")"
    jq --raw-input --slurp --argjson ms "$now_ms" '
        def num: if . == "null" or . == "" then null else tonumber end;
        { generatedMs: $ms,
          entries: ( split("\n")
                     | map(select(length > 0))
                     | map(split("\t"))
                     | map({ key: .[0],
                             value: { width:      (.[1] | num),
                                      height:     (.[2] | num),
                                      durationMs: (.[3] | num),
                                      createdMs:  (.[4] | num),
                                      uploadedMs: (.[5] | num),
                                      proxyPath:  (if .[6] == "" then null else .[6] end) } })
                     | from_entries ) }' "$TMP_TSV" >"$TMP_OUT" ||
        die "failed to build index JSON"

    chmod 644 "$TMP_OUT"
    mv "$TMP_OUT" "$out"
    TMP_OUT=""
    OK "indexed $((probed + reused)) media file(s) ($probed probed, $reused cached) → $out"
}

main "$@"
