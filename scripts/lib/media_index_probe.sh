#!/bin/bash
# media_index_probe.sh — file discovery and per-file probing for
# build_media_index.sh. Sourced by that script (not run directly).
#
# Contract (bash dynamic scope): collect_media fills the globals `media`,
# `kinds`, `mtimes`; probe_video / probe_image assign `dur_ms`, `width` and
# `height`, which the caller (main) declares local.

set -euo pipefail

declare -a media=() kinds=() mtimes=()

# Collect the file list once; fd already prunes the dirs we never index. Then
# keep only media, and drop paths that would corrupt the TSV hand-off. (A tab
# or newline in a media filename is pathological; skipping it loudly beats
# silently mangling the index.)
collect_media() {
    local root="$1"
    local -a all=()
    mapfile -d '' -t all < <(fd --type f --absolute-path \
        --exclude .meta --exclude .thumbs --exclude _thumbs --exclude assets \
        --exclude .proxies \
        . "$root" --print0)

    local abs kind
    media=() kinds=()
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
}

# One batched stat for every mtime, instead of one fork per file. Output is
# one line per argument in order, so no filename parsing is needed. xargs
# keeps this safe if the library ever outgrows ARG_MAX.
load_mtimes() {
    local abs
    mtimes=()
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
}

probe_video() {
    local abs="$1" probe
    probe="$(ffprobe -v quiet -print_format json \
        -show_entries format=duration:stream=width,height \
        -select_streams v:0 "$abs" 2>/dev/null || true)"
    if [[ -n "$probe" ]]; then
        # One jq emits all three values; splitting them into three
        # calls was three forks per video for no benefit.
        # `read` returns 1 at EOF without a delimiter, which under
        # `set -e` would abort the whole run — and the unit ignores
        # this script's exit status, so it would fail silently. Hence
        # the trailing newline on the fallback AND the `|| :`.
        IFS=$'\t' read -r dur_ms width height < <(jq --raw-output '
            [ ((.format.duration // 0) | tonumber * 1000 | floor),
              (.streams[0].width  // "null"),
              (.streams[0].height // "null") ] | @tsv' \
            <<<"$probe" 2>/dev/null || printf 'null\tnull\tnull\n') || :
        : "${dur_ms:=null}" "${width:=null}" "${height:=null}"
    fi
}

# ImageMagick is authoritative for image dimensions (ffprobe is
# unreliable on stills); [0] takes the first frame of multi-frame
# images (e.g. GIFs) so the geometry is a single "W H".
probe_image() {
    local dims
    dims="$(identify -format '%w %h' "${1}[0]" 2>/dev/null || true)"
    if [[ "$dims" =~ ^([0-9]+)\ ([0-9]+)$ ]]; then
        width="${BASH_REMATCH[1]}"
        height="${BASH_REMATCH[2]}"
    fi
}
