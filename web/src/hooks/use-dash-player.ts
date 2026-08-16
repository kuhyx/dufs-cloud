import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  audioStreams,
  initUrl,
  parseDashManifest,
  segmentAt,
  videoStream,
  type DashManifest,
  type DashStream,
} from "../lib/dash-manifest.ts";
import {
  BUFFER_AHEAD,
  append,
  clear,
  feed,
  fetchSegment,
  isBuffered,
  nextSegment,
} from "../lib/dash-buffer.ts";

/** What the viewer needs to render an audio-track picker. */
export interface DashPlayer {
  /** Selectable audio streams, one per language; empty when not using DASH. */
  readonly audio: readonly DashStream[];
  /** Stream id currently feeding the audio buffer, or null. */
  readonly activeAudio: string | null;
  readonly selectAudio: (id: string) => void;
  /** Object URL of the MediaSource to put on the <video>, or null to play the
   * ordinary file. Returned rather than assigned here so React owns the
   * attribute and the effect never mutates the element it was handed. */
  readonly src: string | null;
}

/** The audio stream with `id`, or null. */
function audioTrack(
  manifest: DashManifest | null,
  id: string | null,
): DashStream | null {
  if (manifest === null || id === null) return null;
  return audioStreams(manifest).find((s) => s.id === id) ?? null;
}

/** Fetches and parses the manifest for `dir`, or null when there is none.
 *
 * Keyed by the directory it was fetched for, so a stale manifest is never
 * returned for the next video: switching videos changes the key and the result
 * is discarded until the new fetch lands. Deriving this rather than clearing it
 * in an effect avoids a cascading render. */
function useManifest(dir: string | null): DashManifest | null {
  const [fetched, setFetched] = useState<{
    dir: string;
    manifest: DashManifest | null;
  } | null>(null);

  useEffect(() => {
    if (dir === null) return undefined;
    const abort = new AbortController();
    void (async () => {
      const data = await fetchSegment(`${dir}/manifest.mpd`, abort.signal);
      if (abort.signal.aborted) return;
      const parsed =
        data === null
          ? null
          : parseDashManifest(new TextDecoder().decode(data));
      setFetched({ dir, manifest: parsed });
    })();
    return () => {
      abort.abort();
    };
  }, [dir]);

  return fetched !== null && fetched.dir === dir ? fetched.manifest : null;
}

/** Drives a <video> through Media Source Extensions so its audio track can be
 * switched.
 *
 * Chrome does not implement `HTMLMediaElement.audioTracks`, so a plain
 * `<video src>` plays whichever audio track is first and offers no way to reach
 * the others — which pins every dual-audio release in this library to its
 * English dub. Feeding one media element from a video SourceBuffer and an audio
 * SourceBuffer fixes that: switching language re-feeds only the audio buffer,
 * and because there is a single element there is a single clock, so audio and
 * video cannot drift. A second <audio> element was measured first and drifted
 * 8.4 s under throttling, which is why this exists.
 *
 * `dir` is the video's `dashPath`; null disables the hook and the caller falls
 * back to ordinary `src` playback. */
export function useDashPlayer(
  video: HTMLVideoElement | null,
  dir: string | null,
): DashPlayer {
  const manifest = useManifest(dir);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);

  // Created during render, not in the effect: the <video>'s src is React's to
  // own, and setting it from an effect would cascade a render on every open.
  // One MediaSource per manifest, so switching videos builds a fresh one.
  const attached = useMemo(() => {
    if (manifest === null) return null;
    const media = new MediaSource();
    return { manifest, media, url: URL.createObjectURL(media) };
  }, [manifest]);

  // Read by the feeding loop, which must not re-subscribe when the language
  // changes: re-running the attach effect would tear down the video buffer too.
  const audioBuffer = useRef<SourceBuffer | null>(null);
  /** Repoints the live feeding loop at another stream, set by the attach
   * effect. Going through a ref is what lets a language change avoid
   * re-running that effect, which would tear the video buffer down too. */
  const published = useRef<((stream: DashStream) => void) | null>(null);

  useEffect(() => {
    // `attached` is non-null exactly when `manifest` is, so testing it here
    // both narrows the type and covers the manifest case.
    if (video === null || attached === null || dir === null) return undefined;
    const { manifest: parsed, media, url } = attached;
    const vStream = videoStream(parsed);
    const first = audioStreams(parsed)[0];
    if (vStream === null || first === undefined) return undefined;
    const abort = new AbortController();

    /** Keep both buffers ahead of the playhead, refilling after a seek. */
    const pump = (vBuf: SourceBuffer, aBuf: SourceBuffer) => {
      return async (): Promise<void> => {
        if (media.readyState !== "open" || vBuf.updating || aBuf.updating) {
          return;
        }
        const t = video.currentTime;
        // Captured, not re-read: `pump` is created once per opening fill and
        // re-created whenever the effect re-runs for a new manifest, so the
        // stream it feeds is whatever `selectAudio` last published for THIS
        // manifest. `activeRef` exists so the swap does not re-subscribe.
        const audio = activeStream.stream;
        // After a seek the playhead lands outside everything buffered; drop it
        // all rather than bridging a gap MSE will not play across.
        if (!isBuffered(vBuf, t)) {
          await clear(vBuf);
          await clear(aBuf);
          const from = segmentAt(vStream.segments, t);
          await feed(vBuf, dir, vStream, from, BUFFER_AHEAD, abort.signal);
          await feed(
            aBuf,
            dir,
            audio,
            segmentAt(audio.segments, t),
            BUFFER_AHEAD + 1,
            abort.signal,
          );
          return;
        }
        const vNext = nextSegment(vStream.segments, vBuf, t);
        await feed(vBuf, dir, vStream, vNext, 1, abort.signal);
        const aNext = nextSegment(audio.segments, aBuf, t);
        await feed(aBuf, dir, audio, aNext, 1, abort.signal);
      };
    };

    /** The stream the pump feeds; `selectAudio` repoints it without
     * re-running this effect, which would tear the video buffer down too. */
    const activeStream: { stream: DashStream } = { stream: first };
    published.current = (stream: DashStream) => {
      activeStream.stream = stream;
    };

    let onTime: (() => void) | null = null;
    const onOpen = (): void => {
      void (async () => {
        let vBuf: SourceBuffer;
        let aBuf: SourceBuffer;
        try {
          vBuf = media.addSourceBuffer(vStream.mimeCodec);
          aBuf = media.addSourceBuffer(first.mimeCodec);
        } catch {
          // A codec this browser will not take: leave the element for the
          // caller's plain-src fallback rather than half-driving it.
          return;
        }
        audioBuffer.current = aBuf;
        setActiveAudio(first.id);

        // No abort check between these: fetchSegment returns null once the
        // request is aborted, and feed() below stops on the same signal, so a
        // teardown mid-startup already stops everything.
        const vInit = await fetchSegment(initUrl(dir, vStream), abort.signal);
        const aInit = await fetchSegment(initUrl(dir, first), abort.signal);
        if (vInit !== null) await append(vBuf, vInit);
        if (aInit !== null) await append(aBuf, aInit);
        await feed(vBuf, dir, vStream, 0, BUFFER_AHEAD, abort.signal);
        await feed(aBuf, dir, first, 0, BUFFER_AHEAD + 1, abort.signal);

        const run = pump(vBuf, aBuf);
        onTime = () => {
          void run();
        };
        video.addEventListener("timeupdate", onTime);
        video.addEventListener("seeking", onTime);
      })();
    };
    media.addEventListener("sourceopen", onOpen, { once: true });

    return () => {
      abort.abort();
      if (onTime !== null) {
        video.removeEventListener("timeupdate", onTime);
        video.removeEventListener("seeking", onTime);
      }
      media.removeEventListener("sourceopen", onOpen);
      published.current = null;
      // Deliberately NOT clearing audioBuffer here. StrictMode double-invokes
      // effects, and this cleanup runs after the next run has already published
      // its buffer; nulling it would reject every later track switch. The ref
      // is overwritten by whichever run is live, and the abort above is what
      // actually stops this run's work.
      URL.revokeObjectURL(url);
    };
  }, [video, dir, attached]);

  const selectAudio = useCallback(
    (id: string): void => {
      const buffer = audioBuffer.current;
      const stream = audioTrack(manifest, id);
      if (buffer === null || stream === null || video === null || dir === null) {
        return;
      }
      setActiveAudio(id);
      published.current?.(stream);
      void (async () => {
        const t = video.currentTime;
        await clear(buffer);
        // A different track needs its own initialization segment before any of
        // its media segments will decode.
        const init = await fetchSegment(initUrl(dir, stream), NEVER);
        if (init !== null) await append(buffer, init);
        await feed(
          buffer,
          dir,
          stream,
          segmentAt(stream.segments, t),
          BUFFER_AHEAD + 1,
          NEVER,
        );
      })();
    },
    [manifest, video, dir],
  );

  return {
    audio: manifest === null ? EMPTY : audioStreams(manifest),
    activeAudio,
    selectAudio,
    src: attached?.url ?? null,
  };
}

/** Shared empty list, so a non-DASH video keeps one array identity. */
const EMPTY: readonly DashStream[] = [];

/** A signal that never aborts, for a swap that must finish even as effects
 * around it settle. */
const NEVER = new AbortController().signal;
