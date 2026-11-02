import JASSUB from "jassub";
import type { SubtitleTrack } from "../lib/subtitles.ts";

export interface JassubSource {
  readonly video: HTMLVideoElement | null;
  readonly track: SubtitleTrack | null;
  readonly fonts: readonly string[];
}

export interface Jassub {
  /** Rebuilds the renderer only when the video, track or font list changed. */
  update: (source: JassubSource) => void;
  setOffsetMs: (ms: number) => void;
  dispose: () => void;
}

/** libass (WASM) renderer bound to a <video>. jassub v2 cannot swap the track
 * on a live instance, so a changed track rebuilds it. Fonts are compared by
 * their newline-joined URLs but handed to libass as the array: the URLs hold
 * spaces, so one joined string would be unfetchable. */
export function createJassub(): Jassub {
  let renderer: JASSUB | null = null;
  let key: { video: HTMLVideoElement; track: SubtitleTrack; fonts: string } | null =
    null;
  let offsetMs = 0;

  const teardown = (): void => {
    const old = renderer;
    renderer = null;
    key = null;
    void old?.destroy().catch(() => undefined);
  };

  return {
    update: ({ video, track, fonts }) => {
      const joined = fonts.join("\n");
      if (
        key !== null &&
        key.video === video &&
        key.track === track &&
        key.fonts === joined
      ) {
        return;
      }
      teardown();
      if (video === null || track === null) return;
      renderer = new JASSUB({
        video,
        subUrl: track.url,
        fonts: joined === "" ? [] : joined.split("\n"),
      });
      renderer.timeOffset = offsetMs / 1000;
      key = { video, track, fonts: joined };
    },
    setOffsetMs: (ms) => {
      offsetMs = ms;
      if (renderer !== null) renderer.timeOffset = ms / 1000;
    },
    dispose: teardown,
  };
}
