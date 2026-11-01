#!/bin/bash
# media_index_common.sh — logging helpers, tool checks, cloud-root lookup and
# the prior-index cache for build_media_index.sh. Sourced by that script (not
# run directly); it relies on DUFS_YAML defined by the entry script.
# PRIOR_* tables are consumed by the other media_index_*.sh libs and main

set -euo pipefail

C() { printf '\033[1;34m[media-index]\033[0m %s\n' "$*"; }
OK() { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
WARN() { printf '\033[1;33m[media-index] WARN:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[media-index] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# Resolve the dufs serve path (the cloud root) from its config, else default.
cloud_root() {
    local sp=""
    [[ -f "$DUFS_YAML" ]] &&
        sp="$(sed -nE 's/^serve-path:[[:space:]]*//p' "$DUFS_YAML" | head -1)"
    printf '%s' "${sp:-$HOME/data/cloud}"
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

# Preserve an entry's first-seen time from the prior index, else use `now_ms`.
# Result in REPLY (no subshell: this runs once per file).
resolve_uploaded_ms() {
    local prior="${PRIOR_UPLOADED[$1]:-}"
    [[ -n "$prior" && "$prior" != "null" ]] || prior="$2"
    REPLY="$prior"
}
