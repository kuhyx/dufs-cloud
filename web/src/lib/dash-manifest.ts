/** Parsing of the DASH manifests written by `scripts/generate_dash_streams.sh`.
 *
 * Deliberately free of MSE and of React so it stays unit-testable: this module
 * only turns the MPD XML into the segment maths the player needs.
 *
 * Only the subset this repo emits is handled — a static, on-disk, single-Period
 * manifest using SegmentTemplate + SegmentTimeline. It is not a general DASH
 * implementation and does not try to be.
 *
 * The load-bearing detail is that audio and video are NOT segment-aligned:
 * ffmpeg cuts video at keyframes and audio on its own boundaries, so one
 * episode here is 168 video segments and 239 audio segments. Segment index N
 * is a different instant in each stream, which is why every stream carries its
 * own timeline and is looked up separately. */

/** One stream's segment, in seconds. */
export interface DashSegment {
  /** Presentation time this segment starts at. */
  readonly start: number;
  /** How long it runs. */
  readonly duration: number;
}

/** One selectable stream: the video, or one audio language. */
export interface DashStream {
  /** `$RepresentationID$` — the number in `chunk-stream<N>-00001.m4s`. */
  readonly id: string;
  /** "video" or "audio". */
  readonly contentType: string;
  /** ISO-639 language tag as muxed ("eng", "jpn"), or "" when untagged. */
  readonly language: string;
  /** MSE codec string, e.g. `video/mp4; codecs="avc1.640028"`. */
  readonly mimeCodec: string;
  /** This stream's own segments, in presentation order. */
  readonly segments: readonly DashSegment[];
}

/** A parsed manifest: every stream, plus the overall duration. */
export interface DashManifest {
  readonly durationMs: number;
  readonly streams: readonly DashStream[];
}

/** Expand a `<SegmentTimeline>` into one entry per segment.
 *
 * `t` restates the running time (present on the first entry, and after any
 * discontinuity); `r` repeats the previous duration r more times, so `r=2`
 * means three segments in total. */
function readTimeline(
  template: Element,
  timescale: number,
): DashSegment[] {
  const out: DashSegment[] = [];
  let time = 0;
  for (const s of Array.from(template.getElementsByTagName("S"))) {
    const t = s.getAttribute("t");
    if (t !== null) time = Number(t);
    const d = Number(s.getAttribute("d") ?? 0);
    const repeats = Number(s.getAttribute("r") ?? 0);
    for (let i = 0; i <= repeats; i++) {
      out.push({ start: time / timescale, duration: d / timescale });
      time += d;
    }
  }
  return out;
}

/** `PT23M56.0S` → seconds. Returns 0 for anything unparseable, which the
 * caller treats as "unknown" rather than as a zero-length video. */
export function parseDuration(value: string | null): number {
  if (value === null) return 0;
  const m = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(
    value,
  );
  if (m === null) return 0;
  return (
    Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  );
}

/** Parse one `<AdaptationSet>`, or null when it carries nothing playable. */
function readStream(set: Element): DashStream | null {
  const rep = set.getElementsByTagName("Representation")[0];
  const template = set.getElementsByTagName("SegmentTemplate")[0];
  if (rep === undefined || template === undefined) return null;

  const id = rep.getAttribute("id");
  const codecs = rep.getAttribute("codecs");
  const mime = rep.getAttribute("mimeType") ?? set.getAttribute("mimeType");
  if (id === null || codecs === null || mime === null) return null;

  const timescale = Number(template.getAttribute("timescale") ?? 0);
  if (timescale <= 0) return null;

  const language = set.getAttribute("lang") ?? "";
  return {
    id,
    contentType: set.getAttribute("contentType") ?? "",
    // "und" is the muxer's "untagged", not a language anyone can pick.
    language: language === "und" ? "" : language,
    mimeCodec: `${mime}; codecs="${codecs}"`,
    segments: readTimeline(template, timescale),
  };
}

/** Parse an MPD document. Returns null when it is not a manifest this player
 * can drive — a broken fetch or an unexpected profile should fall back to
 * ordinary playback rather than throw in the middle of opening a video. */
export function parseDashManifest(xml: string): DashManifest | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const mpd = doc.getElementsByTagName("MPD")[0];
  if (mpd === undefined) return null;

  const streams: DashStream[] = [];
  for (const set of Array.from(doc.getElementsByTagName("AdaptationSet"))) {
    const stream = readStream(set);
    if (stream !== null && stream.segments.length > 0) streams.push(stream);
  }
  if (streams.length === 0) return null;

  return {
    durationMs: parseDuration(mpd.getAttribute("mediaPresentationDuration")) * 1000,
    streams,
  };
}

/** The video stream, or null when the manifest has none. */
export function videoStream(manifest: DashManifest): DashStream | null {
  return manifest.streams.find((s) => s.contentType === "video") ?? null;
}

/** Every audio stream, in manifest order — one per selectable language. */
export function audioStreams(manifest: DashManifest): readonly DashStream[] {
  return manifest.streams.filter((s) => s.contentType === "audio");
}

/** Index of the segment covering `time`, clamped into range.
 *
 * Each stream must be looked up with its OWN segments; sharing an index across
 * streams silently feeds the wrong instant and stalls playback. */
export function segmentAt(
  segments: readonly DashSegment[],
  time: number,
): number {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg !== undefined && time < seg.start + seg.duration) return i;
  }
  return Math.max(0, segments.length - 1);
}

/** URL of a stream's initialization segment, relative to the manifest dir. */
export function initUrl(dir: string, stream: DashStream): string {
  return `${dir}/init-stream${stream.id}.m4s`;
}

/** URL of a stream's `index`-th segment (0-based here; 1-based on disk). */
export function segmentUrl(
  dir: string,
  stream: DashStream,
  index: number,
): string {
  const n = String(index + 1).padStart(5, "0");
  return `${dir}/chunk-stream${stream.id}-${n}.m4s`;
}
