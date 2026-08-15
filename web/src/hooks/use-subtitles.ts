import { useCallback, useMemo, useState } from "react";
import type { DirEntry, SubtitleManifest } from "../api/types.ts";
import {
  allTracks,
  pickDefaultSubtitle,
  type SubtitleTrack,
} from "../lib/subtitles.ts";

/** Persisted across videos: which language the user last chose, and whether
 * they had subtitles off entirely. Storing the *language* rather than a track
 * id is what makes the choice carry from one episode to the next — track ids
 * are per-file. */
const PREF_KEY = "subtitle-preference";

/** "off", or a language tag. */
function readPreference(): string | null {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    // Private-mode or storage-disabled browsers throw rather than no-op.
    return null;
  }
}

function writePreference(value: string): void {
  try {
    localStorage.setItem(PREF_KEY, value);
  } catch {
    // Losing the preference is not worth breaking playback over.
  }
}

/** Applies the remembered preference to this video's tracks, falling back to
 * the automatic pick when the remembered language is not among them. */
function initialTrack(tracks: readonly SubtitleTrack[]): SubtitleTrack | null {
  const pref = readPreference();
  if (pref === "off") return null;
  if (pref !== null) {
    const remembered = tracks.find((t) => t.language === pref && !t.isForced);
    if (remembered !== undefined) return remembered;
  }
  return pickDefaultSubtitle(tracks);
}

interface Subtitles {
  readonly tracks: readonly SubtitleTrack[];
  readonly active: SubtitleTrack | null;
  readonly select: (track: SubtitleTrack | null) => void;
  readonly offsetMs: number;
  readonly setOffsetMs: (ms: number) => void;
  /** Extracted font URLs, space-joined for {@link useJassub}. */
  readonly fontKey: string;
}

/** Collects a video's subtitle tracks from both sources and owns the
 * selection, the remembered preference and the timing offset.
 *
 * `manifest` is the video's extracted `tracks.json` (embedded tracks, which
 * appear only after the indexer runs); `siblings` supplies sidecar files,
 * which are visible the moment they are dropped next to the video. */
export function useSubtitles(
  entry: DirEntry,
  siblings: readonly DirEntry[],
  subtitlesPath: string | null,
  manifest: SubtitleManifest | null,
): Subtitles {
  const tracks = useMemo(
    () => allTracks(entry, siblings, subtitlesPath, manifest),
    [entry, siblings, subtitlesPath, manifest],
  );

  // Only the user's explicit choice is stored; the automatic pick is derived
  // below. Storing the pick would mean writing state from an effect every time
  // the track list arrived, which cascades renders.
  const [chosen, setChosen] = useState<{ id: string | null } | null>(null);

  const [offsetMs, setOffsetMs] = useState(0);

  // Derived, not stored: the track list arrives asynchronously, and writing
  // the pick into state from an effect would cascade renders.
  const automatic = initialTrack(tracks);

  // "Off" is a real choice and must survive; a chosen id this video does not
  // have (picked on a previous episode) falls back to the automatic pick.
  let active = automatic;
  if (chosen !== null) {
    active =
      chosen.id === null
        ? null
        : (tracks.find((t) => t.id === chosen.id) ?? automatic);
  }

  const select = useCallback((track: SubtitleTrack | null) => {
    setChosen({ id: track?.id ?? null });
    writePreference(track === null ? "off" : track.language);
  }, []);

  const fontKey = useMemo(() => {
    if (subtitlesPath === null || manifest === null) return "";
    return manifest.fonts.map((f) => `${subtitlesPath}/fonts/${f}`).join(" ");
  }, [subtitlesPath, manifest]);

  return { tracks, active, select, offsetMs, setOffsetMs, fontKey };
}
