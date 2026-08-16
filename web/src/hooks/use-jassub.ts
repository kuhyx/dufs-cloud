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
 * `fonts` is the video's own extracted font URLs. Releases attach the exact
 * faces their typesetting references, and without them libass substitutes and
 * signs render visibly wrong. The effect keys on the joined URLs rather than the
 * array identity, which would change on every render and rebuild the renderer
 * continuously — but the *array* is what reaches libass, because these URLs
 * contain spaces (both the video directory and the font names do) and joining
 * them into a single string would make them unfetchable. */
export function useJassub(
  video: HTMLVideoElement | null,
  track: SubtitleTrack | null,
  fonts: readonly string[],
  offsetMs: number,
): void {
  // Held in a ref so changing the offset nudges the live instance instead of
  // rebuilding the renderer (which would re-parse the whole subtitle file).
  const instance = useRef<JASSUB | null>(null);

  // The effect depends on this rather than on `fonts`, whose identity changes
  // every render and would rebuild the renderer continuously. Newline is the
  // separator because a percent-encoded URL can never contain one, so the split
  // below restores the exact list — unlike a space, which silently shredded
  // every URL containing one (video directories and font names both do).
  const fontKey = fonts.join("\n");

  useEffect(() => {
    if (video === null || track === null) return undefined;

    const renderer = new JASSUB({
      video,
      subUrl: track.url,
      fonts: fontKey === "" ? [] : fontKey.split("\n"),
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
