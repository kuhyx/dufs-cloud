import {
  audioStreams,
  initUrl,
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
import { audioTrack, createManifest } from "./dash-manifest.ts";
import { createStore, memo, type Readable } from "./store.ts";

/** What the viewer needs to render an audio-track picker. */
export interface DashPlayerState {
  /** Selectable audio streams, one per language; empty when not using DASH. */
  readonly audio: readonly DashStream[];
  /** Stream id currently feeding the audio buffer, or null. */
  readonly activeAudio: string | null;
  /** Object URL of the MediaSource to put on the <video>, or null to play the
   * ordinary file. */
  readonly src: string | null;
}

export interface DashPlayer extends Readable<DashPlayerState> {
  /** `dir` is the video's `dashPath`; null falls back to ordinary `src`. */
  setSource: (video: HTMLVideoElement | null, dir: string | null) => void;
  selectAudio: (id: string) => void;
  dispose: () => void;
}

interface Attached {
  readonly manifest: DashManifest;
  readonly media: MediaSource;
  readonly url: string;
}

const EMPTY: readonly DashStream[] = [];

/** A signal that never aborts, for a track swap that must run to completion. */
const NEVER = new AbortController().signal;

/** Keeps both buffers ahead of the playhead, refilling after a seek. `current`
 * is read on every run so a language change repoints the feed without
 * re-binding (which would tear the video buffer down too). */
function pump(
  video: HTMLVideoElement,
  media: MediaSource,
  dir: string,
  vStream: DashStream,
  current: { stream: DashStream },
  bufs: { video: SourceBuffer; audio: SourceBuffer },
  signal: AbortSignal,
): () => Promise<void> {
  const { video: vBuf, audio: aBuf } = bufs;
  return async (): Promise<void> => {
    if (media.readyState !== "open" || vBuf.updating || aBuf.updating) return;
    const t = video.currentTime;
    const audio = current.stream;
    // After a seek the playhead lands outside everything buffered; drop it all
    // rather than bridging a gap MSE will not play across.
    if (!isBuffered(vBuf, t)) {
      await clear(vBuf);
      await clear(aBuf);
      await feed(vBuf, dir, vStream, segmentAt(vStream.segments, t), BUFFER_AHEAD, signal);
      await feed(aBuf, dir, audio, segmentAt(audio.segments, t), BUFFER_AHEAD + 1, signal);
      return;
    }
    await feed(vBuf, dir, vStream, nextSegment(vStream.segments, vBuf, t), 1, signal);
    await feed(aBuf, dir, audio, nextSegment(audio.segments, aBuf, t), 1, signal);
  };
}

/** Drives a <video> through Media Source Extensions so its audio track can be
 * switched: Chrome has no `audioTracks`, so a plain `<video src>` plays only
 * the first track. Video and audio SourceBuffers share one element and clock;
 * switching language re-feeds only the audio buffer. */
export function createDashPlayer(): DashPlayer {
  const manifests = createManifest();
  const store = createStore<DashPlayerState>({
    audio: EMPTY,
    activeAudio: null,
    src: null,
  });
  const audioOf = memo((m: DashManifest | null) =>
    m === null ? EMPTY : audioStreams(m),
  );
  let video: HTMLVideoElement | null = null;
  let dir: string | null = null;
  let attached: Attached | null = null;
  let audioBuffer: SourceBuffer | null = null;
  let publish: ((stream: DashStream) => void) | null = null;
  let unbind: (() => void) | null = null;
  let activeAudio: string | null = null;

  const render = (): void => {
    store.setState((cur) => {
      const audio = audioOf(attached?.manifest ?? null);
      const src = attached?.url ?? null;
      if (cur.audio === audio && cur.activeAudio === activeAudio && cur.src === src) {
        return cur;
      }
      return { audio, activeAudio, src };
    });
  };

  const setActive = (id: string | null): void => {
    activeAudio = id;
    render();
  };

  const bind = (target: HTMLVideoElement, source: Attached, root: string): void => {
    const { manifest, media } = source;
    const vStream = videoStream(manifest);
    const first = audioStreams(manifest)[0];
    if (vStream === null || first === undefined) return;
    const abort = new AbortController();
    const current = { stream: first };
    publish = (stream) => {
      current.stream = stream;
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
        audioBuffer = aBuf;
        setActive(first.id);
        const vInit = await fetchSegment(initUrl(root, vStream), abort.signal);
        const aInit = await fetchSegment(initUrl(root, first), abort.signal);
        if (vInit !== null) await append(vBuf, vInit);
        if (aInit !== null) await append(aBuf, aInit);
        await feed(vBuf, root, vStream, 0, BUFFER_AHEAD, abort.signal);
        await feed(aBuf, root, first, 0, BUFFER_AHEAD + 1, abort.signal);
        // Disposed mid-startup: do not attach listeners nothing will remove.
        if (abort.signal.aborted) return;

        const run = pump(target, media, root, vStream, current, { video: vBuf, audio: aBuf }, abort.signal);
        onTime = () => {
          void run();
        };
        target.addEventListener("timeupdate", onTime);
        target.addEventListener("seeking", onTime);
      })();
    };
    media.addEventListener("sourceopen", onOpen, { once: true });

    unbind = () => {
      abort.abort();
      if (onTime !== null) {
        target.removeEventListener("timeupdate", onTime);
        target.removeEventListener("seeking", onTime);
      }
      media.removeEventListener("sourceopen", onOpen);
      publish = null;
    };
  };

  const rebind = (): void => {
    unbind?.();
    unbind = null;
    if (video !== null && attached !== null && dir !== null) {
      bind(video, attached, dir);
    }
  };

  const release = (): void => {
    unbind?.();
    unbind = null;
    if (attached !== null) URL.revokeObjectURL(attached.url);
    attached = null;
    audioBuffer = null;
    activeAudio = null;
  };

  manifests.subscribe(() => {
    const manifest = manifests.getState();
    if (manifest === (attached?.manifest ?? null)) return;
    release();
    if (manifest !== null) {
      const media = new MediaSource();
      attached = { manifest, media, url: URL.createObjectURL(media) };
    }
    rebind();
    render();
  });

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    setSource: (nextVideo, nextDir) => {
      const sameVideo = nextVideo === video;
      video = nextVideo;
      dir = nextDir;
      manifests.setDir(nextDir);
      if (!sameVideo) rebind();
    },
    selectAudio: (id) => {
      const buffer = audioBuffer;
      const stream = audioTrack(attached?.manifest ?? null, id);
      if (buffer === null || stream === null || video === null || dir === null) {
        return;
      }
      const player = video;
      const root = dir;
      setActive(id);
      publish?.(stream);
      void (async () => {
        const t = player.currentTime;
        await clear(buffer);
        // A different track needs its own init segment before its media decodes.
        const init = await fetchSegment(initUrl(root, stream), NEVER);
        if (init !== null) await append(buffer, init);
        await feed(buffer, root, stream, segmentAt(stream.segments, t), BUFFER_AHEAD + 1, NEVER);
      })();
    },
    dispose: () => {
      manifests.dispose();
      release();
    },
  };
}
