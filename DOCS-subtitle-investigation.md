# Subtitle regression investigation — findings

Measured 2026-08-15 against the deployed SPA (`~/cloud`, dufs), headless
Chromium over CDP. Throwaway auth-free dufs on :8899 so measurement is not
mixed up with auth. Target file: `Media/2026/08/[DB]Gekkan Shoujo
Nozaki-kun_-_02_(Dual Audio_10bit_BD1080p_x265).mkv` (356 MB, HEVC, dual audio).

Harnesses live in the session scratchpad (`profile_viewer.py`, `probe_state.py`,
`bench_jassub.py`, `ab_subs.py`).

## Issue 1 — "opening a video takes seconds" — NOT the subtitle work

The A/B that settles it: same file, same React tree, only
`localStorage['subtitle-preference']` differs. With `"off"`, `active` is null
and `useJassub` returns at its guard without building a renderer.

Cold page load per run (`Page.navigate` to `about:blank` between runs), 5 runs
each, ms to `video.readyState >= 3`:

| preference | median | min | max |
|---|---|---|---|
| `off` (no jassub at all) | **657** | 203 | 1063 |
| `eng` (jassub active) | **302** | 253 | 859 |

Subtitles ON is *not* slower than OFF. The overlay itself appears in **0.1 ms**
in both columns; the JASSUB canvas is attached at **50 ms**.

Component costs measured directly, over localhost:

- jassub worker chunk import: 14.3 ms
- `jassub-worker-modern-*.wasm` fetch (2.13 MB): 21.9 ms
- `WebAssembly.compile` of it: 7.4 ms
- `tracks.json`: ~51 ms; the 73 KB `.ass`: ~45 ms

Total subtitle-attributable cost is well under ~150 ms. What actually varies is
the media pipeline: a **bare `<video>` element with no React and no jassub**
takes 203–1316 ms to reach `loadedmetadata` on this file, and `videoWidth`
stays **0** — Chromium never decodes it, because it is HEVC. 46 of 74 mkvs are
HEVC and need the opt-in `--re-encode` tier; `~/cloud/.proxies/` currently has
no proxy for this file.

**Conclusion:** the slowness was the 356 MB HEVC original being range-fetched
and failing to decode, not the subtitle stack. Lazy-loading jassub would buy
~40 ms and would not fix the complaint.

### Resolved — the proxy was already there

Correction to the paragraph above: `~/cloud/.proxies/` *does* hold an H.264
proxy for this file (450 MB, h264 + aac, full 1436.99 s), the metadata index
carries its `proxyPath`, and `gallery.tsx:544` already prefers it. The earlier
"no proxy for this file" reading came from listing only the top level of
`.proxies/`; the re-encode tier had in fact been run.

Re-measured against the deployed SPA, 3 cold runs, time to `readyState >= 3`:

| run | source | ready | frame |
|---|---|---|---|
| 1 | PROXY (h264) | 101 ms | 1920x1080 |
| 2 | PROXY (h264) | 177 ms | 1920x1080 |
| 3 | PROXY (h264) | 52 ms | 1920x1080 |

**Median 101 ms**, frames decoding at full resolution — the ~100 ms target is
already met. Nothing further to do for issue 1. 36 entries have a `proxyPath`;
any HEVC file still opening slowly is one without a proxy yet, and the fix
there is to run `generate_video_proxies.sh --re-encode`, not a web change.

## Issue 2 — subtitles render only partially — TWO independent bugs

### 2a. `fontKey` is space-joined, and the video paths contain spaces

`use-subtitles.ts:100` joins font URLs with `" "`, and `use-jassub.ts:36`
splits them back on `" "`. `subtitlesPath` for this file is
`/.subs/Media/2026/08/[DB]Gekkan Shoujo Nozaki-kun_-_02_(Dual Audio_...).mkv`,
so 4 font URLs become **16 fragments**:

```
/.subs/Media/2026/08/[DB]Gekkan
Shoujo
Nozaki-kun_-_02_(Dual
Audio_10bit_BD1080p_x265).mkv/fonts/plantc.ttf
...
```

Confirmed live from inside the jassub worker (CDP `Target.setAutoAttach`):

```
JASSUB: Error opening memory font 'font-0'
... through 'font-15'
```

Sixteen failures for four fonts — libass gets **zero** usable fonts. The
suspect in the brief is real and this is it. The fix must also percent-encode
per path segment, the way `encodePath` already does for `tracks.json`.

### 2b. ffmpeg aborts the whole font dump on the first "unsafe" filename

`dump_fonts()` in `scripts/extract_subtitles.sh` uses one
`ffmpeg -dump_attachment:t ""`. ffmpeg refuses filenames it considers unsafe
and **aborts the entire run** rather than skipping one:

```
[aist#0:9/ttf] Filename PLASTIC TOMATO.TTF is unsafe
Error opening input file ...
```

This MKV has **87 font attachments**; the dump died on the 9th, leaving **4**.
The `.ass` references 15+ families (`Gotham Rounded Medium`, `CC Astro City`,
`Open Sans`, `Segoe Print`, `Edo`, …) — almost none extracted.

Library-wide: **20 of 67** extracted videos have fewer fonts than the source
has attachments. Several Nozaki episodes got **zero** (the unsafe name sorted
first).

Verified fix — pass an explicit sanitised name per attachment stream, in a
single ffmpeg invocation, and `-t 0` so it does not decode the file:

- naive current form: 4/87 fonts
- explicit per-stream names: **87/87** in 66 s (full decode)
- plus `-t 0`: **87/87 in 0.29 s**

Note: the staleness check (`tracks.json` newer than source) will skip all 67
existing dirs, so the fix reaches nothing without forcing re-extraction — needs
a version marker in `tracks.json` that the check honours, not a manual `rm -rf`.

### Both fixed and verified (commit 3bc2d73)

`fonts` is now an array end to end, percent-encoded per segment like every
other client path; the effect keys on a newline join, which a percent-encoded
URL can never contain. Extraction dumps each attachment under an explicit
sanitised name, with `-t 0` so ffmpeg does not decode a file it is only reading
attachments from. `extractVersion` in `tracks.json` makes the staleness check
re-extract by itself when the artefacts change.

Results on the Nozaki-kun episode: **4 fonts -> 86**, all 12 ASS style families
now resolve (149 family names across the extracted faces, 0 unreadable).
Library-wide: **0 of 67** videos short on fonts, down from 20.

Verified by sampling JASSUB canvas pixels while playing the H.264 proxy, so
frames actually decode:

| t | opaque px | columns | rows |
|---|---|---|---|
| 15 s | 8018 | 370 | 33 |
| 20 s | 17482 | 759 | 39 |
| 60 s | 22712 | 564 | 79 |
| 320 s | 4844 | 213 | 39 |

**4/4 dialogue points render a full line** (a single glyph is ~25 columns; 79
rows is a two-line block), and the worker logs **zero** "Error opening memory
font" lines, down from 32+ per open. The "only the first letter" symptom is
gone.

The two worker exceptions (`Cannot set properties of undefined` for `loaded`
and `referrer`) still appear on open. They are benign here — the renderer
initialises, sizes its canvas to the video and draws correctly — so they were
not the cause of the missing text. Left alone rather than chased.

## Issue 3 — audio-track picker — feasibility

Confirmed: `<video>.audioTracks` is unimplemented in Chrome, so the browser
exposes only the default audio track. Client-only selection is not possible.

Server-side is the viable route, and the natural host is the re-encode tier in
`scripts/generate_video_proxies.sh`, since 46 of 74 mkvs already need
re-encoding for HEVC. Per-track audio output there costs one extra audio
encode per track, not a second video encode, if the video stream is shared.

Reporting only — scope is the user's call.
