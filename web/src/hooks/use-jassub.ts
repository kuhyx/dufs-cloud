import { useEffect, useRef } from "react";
import JASSUB from "jassub";
import type { SubtitleTrack } from "../lib/subtitles.ts";

/** Binds a libass (WASM) renderer to a <video>, drawing `track` over it.
 *
 * ASS is the only format that survives this library intact — converting it to
 * WebVTT for a native <track> would drop positioning, karaoke and every
 * typeset sign — so rendering goes through libass compiled to WASM.
 *
 * jassub v2 has no "swap the track on a live instance" call, so changing track
 * tears the renderer down and builds a new one; that is what makes the effect's
 * dependency list the whole switching mechanism.
 *
 * `fontKey` is the video's own extracted font URLs joined by spaces. Releases
 * attach the exact faces their typesetting references, and without them libass
 * substitutes and signs render visibly wrong. It is passed pre-joined so this
 * hook depends on a value rather than an array identity that would change on
 * every render and rebuild the renderer continuously. */
export function useJassub(
  video: HTMLVideoElement | null,
  track: SubtitleTrack | null,
  fontKey: string,
  offsetMs: number,
): void {
  // Held in a ref so changing the offset nudges the live instance instead of
  // rebuilding the renderer (which would re-parse the whole subtitle file).
  const instance = useRef<JASSUB | null>(null);

  useEffect(() => {
    if (video === null || track === null) return undefined;

    const renderer = new JASSUB({
      video,
      subUrl: track.url,
      fonts: fontKey === "" ? [] : fontKey.split(" "),
    });
    instance.current = renderer;

    return () => {
      instance.current = null;
      // destroy() is async and rejects if the worker already went away during
      // teardown (StrictMode double-invokes effects); nothing can be done about
      // it by then and it must not surface as an unhandled rejection.
      void renderer.destroy().catch(() => undefined);
    };
  }, [video, track, fontKey]);

  useEffect(() => {
    if (instance.current !== null) {
      instance.current.timeOffset = offsetMs / 1000;
    }
  }, [offsetMs]);
}
