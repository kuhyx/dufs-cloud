import type {
  DirEntry,
  SubtitleManifest,
  SubtitleTrackEntry,
} from "../api/types.ts";
import type { SubtitleTrack } from "../lib/subtitles.ts";

/** A file entry in a directory listing. */
export function file(name: string, dir = "/Media"): DirEntry {
  return { name, path: `${dir}/${name}`, kind: "file", size: 1, mtimeMs: 0 };
}

/** A normalised subtitle track, defaulted to a plain English embedded one. */
export function track(over: Partial<SubtitleTrack> = {}): SubtitleTrack {
  return {
    id: "embedded:0",
    url: "/.subs/v.mkv/00.eng.ass",
    language: "eng",
    title: "",
    isDefault: false,
    isForced: false,
    source: "embedded",
    ...over,
  };
}

/** One entry as it appears in an extracted `tracks.json`. */
export function entry(
  over: Partial<SubtitleTrackEntry> = {},
): SubtitleTrackEntry {
  return {
    si: 0,
    codec: "ass",
    lang: "eng",
    title: "",
    default: false,
    file: "00.eng.ass",
    ...over,
  };
}

/** A whole extracted manifest. */
export function manifest(
  tracks: SubtitleTrackEntry[],
  fonts: string[] = [],
): SubtitleManifest {
  return { generatedMs: 0, fonts, tracks };
}
