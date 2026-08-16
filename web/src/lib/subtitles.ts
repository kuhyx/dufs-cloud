/** Subtitle-track description, labelling and selection for the web player.
 *
 * Deliberately free of jassub and of React so it stays unit-testable.
 *
 * This is the browser port of `app/lib/util/subtitle_track.dart` and keeps its
 * vocabulary and heuristics on purpose: both clients face the same library, so
 * "which track should open by default" must not answer differently depending on
 * which client you happen to be using.
 *
 * The library is anime muxed as Matroska — subtitles are *embedded* ASS tracks
 * (one file carries 17 languages), extracted offline by
 * `scripts/extract_subtitles.sh`. Sidecar `.ass`/`.srt` files next to a video
 * are also supported, but none exist in the library today. */

import type {
  DirEntry,
  SubtitleManifest,
  SubtitleTrackEntry,
} from "../api/types.ts";
import { isSubtitle } from "./paths.ts";

/** Where a track's text came from. */
export type SubtitleSource = "embedded" | "sidecar";

/** One selectable subtitle track, normalised across both sources. */
export interface SubtitleTrack {
  /** Stable identity, unique within one video: used as the React key, the
   * persisted selection, and the picker's value. */
  readonly id: string;
  /** Absolute cloud path to fetch the subtitle text from. */
  readonly url: string;
  /** ISO language tag as muxed ("eng", "pol", …); may be empty. */
  readonly language: string;
  /** Free-text track title ("signs/songs", "NF", …); may be empty. */
  readonly title: string;
  /** Whether the muxer flagged this track as the default. */
  readonly isDefault: boolean;
  /** Whether the track is "forced" (typically signs-only for dubbed audio). */
  readonly isForced: boolean;
  readonly source: SubtitleSource;
}

/** English language tags seen in the wild, lowercased. */
const ENGLISH_TAGS = new Set([
  "en",
  "eng",
  "english",
  "en-us",
  "en-gb",
]);

/** Human-readable names for the language tags present in the library, so the
 * picker reads "Polish" rather than "pol". Unknown tags fall through to the raw
 * tag, which is still better than an opaque track number. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  ara: "Arabic",
  chi: "Chinese",
  dut: "Dutch",
  eng: "English",
  fre: "French",
  ger: "German",
  ind: "Indonesian",
  ita: "Italian",
  jpn: "Japanese",
  kor: "Korean",
  may: "Malay",
  pol: "Polish",
  por: "Portuguese",
  rus: "Russian",
  spa: "Spanish",
  tha: "Thai",
  tur: "Turkish",
  vie: "Vietnamese",
};

/** Whether `language` names English. */
export function isEnglish(language: string): boolean {
  return ENGLISH_TAGS.has(language.toLowerCase());
}

/** Human-readable name for a language tag, falling back to the raw tag.
 *
 * Shared with the audio-track picker: the same tags label both, and a file
 * whose subtitles read "Japanese" should not have its audio read "jpn". */
export function languageName(language: string): string {
  const tag = language.trim();
  return LANGUAGE_NAMES[tag.toLowerCase()] ?? tag;
}

/** Guesses whether a track titled `title` is a "forced"/signs-only track.
 *
 * A heuristic on purpose: the container's forced flag is not carried through
 * extraction, so the muxed title is the only signal available. Matches the
 * conventions actually present in the library. */
export function looksForcedTitle(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("forced") || t.includes("signs");
}

/** Display label for `track` in the subtitle picker.
 *
 * Combines language and title because neither alone disambiguates: a single
 * file can hold "English — Foxtrot" and "English — signs/songs", and the
 * 17-track releases repeat the same title across every language. */
export function subtitleLabel(track: SubtitleTrack): string {
  const language = track.language.trim();
  const title = track.title.trim();
  const named = languageName(language);

  const parts: string[] = [];
  if (named !== "") parts.push(named);
  if (title !== "" && title !== named) parts.push(title);

  // Nothing to show: fall back to the handle so entries stay distinguishable.
  if (parts.length === 0) return `Track ${track.id}`;

  const label = parts.join(" — ");
  return track.isForced ? `${label} (forced)` : label;
}

/** Picks the track to enable when a video opens, or null to start with
 * subtitles off.
 *
 * English wins over the muxer's `default` flag, because that flag is not
 * trustworthy here: `[Foxtrot] Look Back (2024)` flags *both* its English and
 * its Japanese track as default, so honouring the flag first would pick
 * whichever the muxer happened to list earlier.
 *
 * Forced tracks are skipped when choosing automatically — a forced track
 * renders only on-screen text, not dialogue, so auto-selecting it looks like
 * broken subtitles. It stays available in the picker.
 *
 * Order: default-flagged English, then any English, then a default-flagged
 * track, then nothing. It deliberately never falls back to "first available":
 * silently defaulting an English reader into Thai is worse than no subtitles. */
export function pickDefaultSubtitle(
  tracks: readonly SubtitleTrack[],
): SubtitleTrack | null {
  const usable = tracks.filter((t) => !t.isForced);
  const english = usable.filter((t) => isEnglish(t.language));

  return (
    english.find((t) => t.isDefault) ??
    english[0] ??
    usable.find((t) => t.isDefault) ??
    null
  );
}

/** Normalise one manifest entry into a {@link SubtitleTrack}.
 *
 * `dir` is the video's `subtitlesPath` (a directory); track files live in it. */
function fromManifestEntry(
  dir: string,
  entry: SubtitleTrackEntry,
): SubtitleTrack {
  return {
    id: `embedded:${String(entry.si)}`,
    url: `${dir}/${entry.file}`,
    language: entry.lang === "und" ? "" : entry.lang,
    title: entry.title,
    isDefault: entry.default,
    isForced: looksForcedTitle(entry.title),
    source: "embedded",
  };
}

/** Every embedded track for a video, from its extracted manifest. */
export function embeddedTracks(
  subtitlesPath: string | null,
  manifest: SubtitleManifest | null,
): SubtitleTrack[] {
  if (subtitlesPath === null || manifest === null) return [];
  return manifest.tracks.map((t) => fromManifestEntry(subtitlesPath, t));
}

/** Strip the extension from a file name, e.g. "ep01.en.ass" → "ep01.en".
 *
 * Unlike a basename-oriented strip, a leading dot IS an extension separator
 * here: this is also applied to the *remainder* after a video's basename, where
 * ".ass" must reduce to "" (no language tag) rather than staying ".ass". */
function withoutExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? name : name.slice(0, dot);
}

/** Sidecar subtitles for `video` found among its sibling directory entries.
 *
 * Matches on basename prefix: `Show - 01.mkv` claims `Show - 01.ass` and
 * `Show - 01.pol.ass`. The remainder after the video's basename is read as a
 * language tag, so `X.pol.ass` is labelled Polish; a bare `X.ass` has no tag.
 *
 * The prefix must be followed by a "." so that `Show - 1.mkv` does not claim
 * `Show - 10.ass`. */
export function sidecarTracks(
  video: DirEntry,
  siblings: readonly DirEntry[],
): SubtitleTrack[] {
  const base = withoutExtension(video.name);
  const out: SubtitleTrack[] = [];

  for (const entry of siblings) {
    if (entry.kind !== "file") continue;
    if (!isSubtitle(entry.name)) continue;
    if (!entry.name.startsWith(base)) continue;

    // "Show - 01" + ".ass" (no tag) or + ".pol.ass" (tag "pol").
    const rest = withoutExtension(entry.name.slice(base.length));
    if (rest !== "" && !rest.startsWith(".")) continue;
    const language = rest === "" ? "" : rest.slice(1);

    out.push({
      id: `sidecar:${entry.path}`,
      url: entry.path,
      language,
      title: "",
      isDefault: false,
      isForced: looksForcedTitle(entry.name),
      source: "sidecar",
    });
  }
  return out;
}

/** All tracks for a video, embedded first then sidecars.
 *
 * Both sources coexist: embedded tracks appear only after the indexer's next
 * run, while a sidecar dropped next to a video is visible immediately. */
export function allTracks(
  video: DirEntry,
  siblings: readonly DirEntry[],
  subtitlesPath: string | null,
  manifest: SubtitleManifest | null,
): SubtitleTrack[] {
  return [
    ...embeddedTracks(subtitlesPath, manifest),
    ...sidecarTracks(video, siblings),
  ];
}
