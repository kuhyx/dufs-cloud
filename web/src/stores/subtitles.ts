import type { DirEntry, SubtitleManifest } from "../api/types.ts";
import { encodePath } from "../lib/paths.ts";
import {
  allTracks,
  pickDefaultSubtitle,
  type SubtitleTrack,
} from "../lib/subtitles.ts";
import { createStore, memo, type Readable } from "./store.ts";

const EMPTY_FONTS: readonly string[] = [];

/** Stores the *language* (or "off"), not a track id, so the choice carries
 * from one episode to the next; track ids are per-file. */
const PREF_KEY = "subtitle-preference";

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

function initialTrack(tracks: readonly SubtitleTrack[]): SubtitleTrack | null {
  const pref = readPreference();
  if (pref === "off") return null;
  if (pref !== null) {
    const remembered = tracks.find((t) => t.language === pref && !t.isForced);
    if (remembered !== undefined) return remembered;
  }
  return pickDefaultSubtitle(tracks);
}

/** `siblings` supplies sidecar files; `manifest` the extracted embedded tracks. */
export interface SubtitleInput {
  readonly entry: DirEntry;
  readonly siblings: readonly DirEntry[];
  readonly subtitlesPath: string | null;
  readonly manifest: SubtitleManifest | null;
}

export interface SubtitlesState {
  readonly tracks: readonly SubtitleTrack[];
  readonly active: SubtitleTrack | null;
  readonly offsetMs: number;
  /** Percent-encoded font URLs, stable while the video and manifest are. */
  readonly fonts: readonly string[];
}

export interface Subtitles extends Readable<SubtitlesState> {
  setInput: (input: SubtitleInput) => void;
  select: (track: SubtitleTrack | null) => void;
  setOffsetMs: (ms: number) => void;
  dispose: () => void;
}

export function createSubtitles(input: SubtitleInput): Subtitles {
  let current = input;
  let chosen: { id: string | null } | null = null;
  let offsetMs = 0;

  const tracksFor = memo(allTracks);
  const fontsFor = memo(
    (subtitlesPath: string | null, manifest: SubtitleManifest | null) => {
      if (subtitlesPath === null || manifest === null) return EMPTY_FONTS;
      return manifest.fonts.map((f) =>
        encodePath(`${subtitlesPath}/fonts/${f}`),
      );
    },
  );
  const stateFor = memo(
    (
      tracks: readonly SubtitleTrack[],
      active: SubtitleTrack | null,
      offset: number,
      fonts: readonly string[],
    ): SubtitlesState => ({ tracks, active, offsetMs: offset, fonts }),
  );

  const compute = (): SubtitlesState => {
    const { entry, siblings, subtitlesPath, manifest } = current;
    const tracks = tracksFor(entry, siblings, subtitlesPath, manifest);
    const automatic = initialTrack(tracks);
    let active = automatic;
    if (chosen !== null) {
      const id = chosen.id;
      active =
        id === null ? null : (tracks.find((t) => t.id === id) ?? automatic);
    }
    return stateFor(tracks, active, offsetMs, fontsFor(subtitlesPath, manifest));
  };

  const store = createStore<SubtitlesState>(compute());
  const refresh = (): void => {
    store.setState(compute());
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    setInput: (next) => {
      current = next;
      refresh();
    },
    select: (track) => {
      chosen = { id: track?.id ?? null };
      writePreference(track === null ? "off" : track.language);
      refresh();
    },
    setOffsetMs: (ms) => {
      offsetMs = ms;
      refresh();
    },
    dispose: () => undefined,
  };
}
