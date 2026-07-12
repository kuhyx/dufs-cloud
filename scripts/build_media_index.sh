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
#         "createdMs": <mtime ms>, "uploadedMs": <first-seen ms>
#       }, ... } }
#
# Keys are absolute cloud paths (leading slash), matching what the SPA requests.
# Durations/dimensions come from ffprobe; images get dimensions only. The prior
# index (if any) is reused so `uploadedMs` records when a file was FIRST seen.
# Idempotent and safe to re-run (e.g. after each media sync).
# ============================================================================

set -euo pipefail

DUFS_YAML="${DUFS_YAML:-$HOME/.config/dufs/dufs.yaml}"
readonly DUFS_YAML

C() { printf '\033[1;34m[media-index]\033[0m %s\n' "$*"; }
OK() { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[media-index] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

TMP_JSON=""
cleanup() { [[ -n "$TMP_JSON" && -f "$TMP_JSON" ]] && rm -f "$TMP_JSON"; }
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
    if ((${#missing[@]} > 0)); then
        command -v pacman >/dev/null ||
            die "missing: ${missing[*]} (install them and re-run)"
        C "Installing: ${missing[*]}"
        sudo pacman -S --needed --noconfirm "${missing[@]}"
    fi
}

readonly VIDEO_RE='\.(mp4|mkv|mov|avi|webm|m4v|3gp|ogv|mpg|mpeg|mts|m2ts|vob|wmv|flv)$'
readonly IMAGE_RE='\.(jpg|jpeg|png|gif|bmp|tiff|tif|webp|heic|heif|avif)$'

main() {
    [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] &&
        { grep -E '^#( |$)' "$0" | sed -E 's/^# ?//'; exit 0; }

    require_tools
    local root; root="$(cloud_root)"
    [[ -d "$root" ]] || die "cloud root not found: $root"
    local meta_dir="$root/.meta"
    local out="$meta_dir/index.json"
    mkdir -p "$meta_dir"

    local now_ms; now_ms="$(date +%s%3N)"
    # Prior uploadedMs values, so a file's first-seen time is preserved.
    local prior='{}'
    [[ -f "$out" ]] && prior="$(jq -c '.entries // {}' "$out" 2>/dev/null || echo '{}')"

    TMP_JSON="$(mktemp)"
    printf '{}' >"$TMP_JSON"

    C "Probing media under $root (excluding .meta, .thumbs, assets)"
    local count=0
    # -H includes no hidden by default; prune app/meta/thumbnail dirs explicitly.
    while IFS= read -r -d '' abs; do
        local rel="/${abs#"$root"/}"
        local kind=""
        if [[ "$abs" =~ $VIDEO_RE ]]; then kind="video"
        elif [[ "$abs" =~ $IMAGE_RE ]]; then kind="image"
        else continue; fi

        # mtime in ms (created ≈ last-modified here; birth time is unreliable).
        local mtime_ms=$(( $(stat -c %Y "$abs") * 1000 ))
        # Preserve an existing first-seen time, else stamp it now.
        local uploaded_ms; uploaded_ms="$(jq -r --arg k "$rel" \
            '(.[$k].uploadedMs) // empty' <<<"$prior")"
        [[ -z "$uploaded_ms" ]] && uploaded_ms="$now_ms"

        local dur_ms=null width=null height=null
        if [[ "$kind" == "video" ]]; then
            local probe; probe="$(ffprobe -v quiet -print_format json \
                -show_entries format=duration:stream=width,height \
                -select_streams v:0 "$abs" 2>/dev/null || true)"
            if [[ -n "$probe" ]]; then
                dur_ms="$(jq -r '((.format.duration // 0)|tonumber*1000|floor)' \
                    <<<"$probe" 2>/dev/null || echo null)"
                width="$(jq -r '(.streams[0].width // "null")' <<<"$probe" 2>/dev/null || echo null)"
                height="$(jq -r '(.streams[0].height // "null")' <<<"$probe" 2>/dev/null || echo null)"
            fi
        fi

        # Merge this entry into the accumulator with jq (typed, no string hacks).
        jq -c \
            --arg k "$rel" \
            --argjson w "${width:-null}" \
            --argjson h "${height:-null}" \
            --argjson d "${dur_ms:-null}" \
            --argjson c "$mtime_ms" \
            --argjson u "$uploaded_ms" \
            '.[$k] = {width:$w, height:$h, durationMs:$d, createdMs:$c, uploadedMs:$u}' \
            "$TMP_JSON" >"$TMP_JSON.next" && mv "$TMP_JSON.next" "$TMP_JSON"
        count=$((count + 1))
    done < <(fd --type f --absolute-path \
        --exclude .meta --exclude .thumbs --exclude _thumbs --exclude assets \
        . "$root" --print0)

    jq -n --argjson ms "$now_ms" --slurpfile e "$TMP_JSON" \
        '{generatedMs:$ms, entries:$e[0]}' >"$out"
    OK "indexed $count media file(s) → $out"
}

main "$@"
