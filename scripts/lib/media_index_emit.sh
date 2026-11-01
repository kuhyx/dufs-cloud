#!/bin/bash
# media_index_emit.sh — per-entry TSV row and final JSON document for
# build_media_index.sh. Sourced by that script (not run directly).
#
# emit_row takes everything as arguments:
#   emit_row rel kind width height dur_ms mtime_ms uploaded_ms root

set -euo pipefail

emit_row() {
    local rel="$1" kind="$2" width="$3" height="$4" dur_ms="$5"
    local mtime_ms="$6" uploaded_ms="$7" root="$8"
    local proxy_rel app_proxy_rel subs_rel dash_rel
    # Deliberately OUTSIDE the cache branch: generate_video_proxies.sh can
    # add a proxy long after the source file was last modified, so this
    # must be re-tested every run. It is a fork-free file test.
    proxy_rel=""
    [[ "$kind" == "video" && -f "$root/.proxies$rel.mp4" ]] &&
        proxy_rel="/.proxies$rel.mp4"
    # Same treatment for the app-side Matroska proxy, which only exists for
    # audio the app's libmpv cannot decode (see generate_video_proxies.sh).
    app_proxy_rel=""
    [[ "$kind" == "video" && -f "$root/.proxies$rel.app.mkv" ]] &&
        app_proxy_rel="/.proxies$rel.app.mkv"
    # Likewise re-tested every run: extract_subtitles.sh writes tracks.json
    # as its completion marker long after the source's mtime, so caching
    # this would pin subtitlesPath to null forever. The SPA fetches that
    # manifest to learn which embedded tracks exist.
    subs_rel=""
    [[ "$kind" == "video" && -f "$root/.subs$rel/tracks.json" ]] &&
        subs_rel="/.subs$rel"
    # Only dual-audio videos are segmented, and manifest.mpd is written
    # last, so its presence means the whole segment set is ready. Re-tested
    # every run for the same reason as the two above.
    dash_rel=""
    [[ "$kind" == "video" && -f "$root/.dash$rel/manifest.mpd" ]] &&
        dash_rel="/.dash$rel"

    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$rel" "$width" "$height" "$dur_ms" \
        "$mtime_ms" "$uploaded_ms" "$proxy_rel" "$app_proxy_rel" \
        "$subs_rel" "$dash_rel" >>"$TMP_TSV"
}

# One jq builds the whole document. The previous version re-serialised the
# entire growing index once per file, which is O(n²) writes.
write_index_json() {
    local meta_dir="$1" now_ms="$2" out="$3"
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
                                      proxyPath:  (if .[6] == "" then null else .[6] end),
                                      appProxyPath:
                                        (if (.[7] // "") == "" then null
                                         else .[7] end),
                                      subtitlesPath:
                                        (if (.[8] // "") == "" then null
                                         else .[8] end),
                                      dashPath:
                                        (if (.[9] // "") == "" then null
                                         else .[9] end) } })
                     | from_entries ) }' "$TMP_TSV" >"$TMP_OUT" ||
        die "failed to build index JSON"

    chmod 644 "$TMP_OUT"
    mv "$TMP_OUT" "$out"
    TMP_OUT=""
}
