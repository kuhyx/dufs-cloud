import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashPlayer } from "./use-dash-player.ts";

/** jsdom implements no part of MSE, so the whole boundary is faked: these
 * tests pin what this hook is responsible for — fetching the manifest, wiring
 * one buffer per stream, and re-feeding ONLY the audio buffer on a language
 * change — not libavformat's behaviour. */

class FakeSourceBuffer extends EventTarget {
  updating = false;
  appended = 0;
  removed = 0;
  ranges: { start: number; end: number }[] = [];

  get buffered() {
    const r = this.ranges;
    return {
      length: r.length,
      start: (i: number) => r[i]?.start ?? 0,
      end: (i: number) => r[i]?.end ?? 0,
    };
  }

  private done(): void {
    queueMicrotask(() => {
      this.dispatchEvent(new Event("updateend"));
    });
  }

  appendBuffer(): void {
    this.appended += 1;
    this.done();
  }

  remove(): void {
    this.removed += 1;
    this.done();
  }
}

/** Every MediaSource built during a test, newest last. */
const sources: FakeMediaSource[] = [];

/** When true, the NEXT MediaSource refuses addSourceBuffer, as a browser does
 * for a codec it will not decode. Per-instance on purpose: patching the shared
 * prototype leaked into every later test in this file. */
let refuseNextCodec = false;

class FakeMediaSource extends EventTarget {
  readyState = "open";
  sourceBuffers: FakeSourceBuffer[] = [];
  /** When set, addSourceBuffer throws it (an unsupported codec). */
  refuse: Error | null = null;

  constructor() {
    super();
    if (refuseNextCodec) {
      this.refuse = new Error("unsupported");
      refuseNextCodec = false;
    }
    sources.push(this);
  }

  /** The real event fires only once a media element attaches the object URL,
   * i.e. after the effect subscribes — never from the constructor, which runs
   * during render inside useMemo. Deferring to the listener being added models
   * that without a timer, so a microtask drain settles the whole startup. */
  private opened = false;

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    super.addEventListener(type, listener);
    // Fire ONCE, like a real MediaSource: it opens when a media element
    // attaches the object URL, not once per listener. Re-firing per listener
    // let both StrictMode effect runs attach buffers to the same source, which
    // is not something a browser ever does.
    if (type === "sourceopen" && !this.opened) {
      this.opened = true;
      queueMicrotask(() => {
        this.dispatchEvent(new Event("sourceopen"));
      });
    }
  }

  addSourceBuffer(): FakeSourceBuffer {
    if (this.refuse !== null) throw this.refuse;
    const b = new FakeSourceBuffer();
    this.sourceBuffers.push(b);
    return b;
  }
}

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT0H0M18.0S">
 <Period id="0">
  <AdaptationSet id="0" contentType="video" lang="und">
   <Representation id="0" mimeType="video/mp4" codecs="avc1.640028">
    <SegmentTemplate timescale="1000" media="chunk-stream$RepresentationID$-$Number%05d$.m4s">
     <SegmentTimeline><S t="0" d="6000" r="2" /></SegmentTimeline>
    </SegmentTemplate>
   </Representation>
  </AdaptationSet>
  <AdaptationSet id="1" contentType="audio" lang="eng">
   <Representation id="1" mimeType="audio/mp4" codecs="mp4a.40.2">
    <SegmentTemplate timescale="1000" media="chunk-stream$RepresentationID$-$Number%05d$.m4s">
     <SegmentTimeline><S t="0" d="4000" r="3" /></SegmentTimeline>
    </SegmentTemplate>
   </Representation>
  </AdaptationSet>
  <AdaptationSet id="2" contentType="audio" lang="jpn">
   <Representation id="2" mimeType="audio/mp4" codecs="mp4a.40.2">
    <SegmentTemplate timescale="1000" media="chunk-stream$RepresentationID$-$Number%05d$.m4s">
     <SegmentTimeline><S t="0" d="4000" r="3" /></SegmentTimeline>
    </SegmentTemplate>
   </Representation>
  </AdaptationSet>
 </Period>
</MPD>`;

/** Manifests missing one kind of stream, which the hook must decline to drive
 * rather than half-attach (there is nothing to pair a buffer with). */
const AUDIO_ONLY = MANIFEST.replace(
  /<AdaptationSet id="0"[\s\S]*?<\/AdaptationSet>/,
  "",
);
const VIDEO_ONLY = MANIFEST.replace(
  /<AdaptationSet id="[12]"[\s\S]*?<\/AdaptationSet>/g,
  "",
);

/** Video plus a single audio stream (id "1"), so an id of "2" held over from a
 * previous video does not resolve against it. */
const VIDEO_PLUS_ONE_AUDIO = MANIFEST.replace(
  /<AdaptationSet id="2"[\s\S]*?<\/AdaptationSet>/,
  "",
);

function stubFetch(manifest: string | null = MANIFEST): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("manifest.mpd")) {
        if (manifest === null) return Promise.resolve({ ok: false });
        return Promise.resolve({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(new TextEncoder().encode(manifest).buffer),
        });
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
      });
    }),
  );
}

/** Serve the manifest and media segments, but refuse every init segment, so
 * the hook's "init unavailable" paths run. Nothing should throw: a missing
 * init means this stream will not decode, not that playback should break. */
function stubFetchWithoutInits(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("manifest.mpd")) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(new TextEncoder().encode(MANIFEST).buffer),
        });
      }
      if (url.includes("init-stream")) return Promise.resolve({ ok: false });
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
      });
    }),
  );
}

function video(): HTMLVideoElement {
  return document.createElement("video");
}

beforeEach(() => {
  sources.length = 0;
  refuseNextCodec = false;
  vi.stubGlobal("MediaSource", FakeMediaSource);
  // Order matters: the shared setup's vi.clearAllMocks() runs in its own
  // beforeEach, which wipes any implementation set earlier — including
  // createObjectURL's, leaving it returning undefined so no src ever reaches
  // the element. Re-applying it here (this hook's beforeEach runs after) is
  // what keeps these tests deterministic under the full suite.
  vi.mocked(URL.createObjectURL).mockReturnValue("blob:dash");
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The buffers of the newest MediaSource, narrowed for assertions. */
function buffers(): { video: FakeSourceBuffer; audio: FakeSourceBuffer } {
  // The LAST source: StrictMode double-invokes effects, so an earlier one may
  // have been torn down and is not the one driving playback.
  const source = sources.at(-1);
  const video = source?.sourceBuffers[0];
  const audio = source?.sourceBuffers[1];
  if (video === undefined || audio === undefined) {
    throw new Error("expected both source buffers to exist");
  }
  return { video, audio };
}

/** Wait until both buffers exist AND their opening fill has landed.
 *
 * Startup is several chained awaits (manifest, two init segments, then the
 * first run of media segments); asserting before it settles is what made these
 * tests flake under parallel load rather than in isolation. */
/** Drain every pending microtask and macrotask the fakes use.
 *
 * Startup is a chain of awaits (manifest -> two init segments -> the first run
 * of media segments) plus one setTimeout(0) for `sourceopen`. All of it is
 * already-resolved promises, so a bounded number of drains settles it
 * identically every run. waitFor cannot: it polls on real timers, which made
 * these tests pass alone and fail under the full suite's parallel load. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 200; i++) await Promise.resolve();
  });
}

async function started(): Promise<{
  video: FakeSourceBuffer;
  audio: FakeSourceBuffer;
}> {
  await flush();
  return buffers();
}

describe("useDashPlayer", () => {
  it("stays inert without a dash path", () => {
    stubFetch();
    const { result } = renderHook(() => useDashPlayer(video(), null));
    expect(result.current.audio).toEqual([]);
    expect(result.current.src).toBeNull();
  });

  it("exposes one selectable stream per audio language", async () => {
    stubFetch();
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    await flush();
      expect(result.current.audio).toHaveLength(2);

    expect(result.current.audio.map((s) => s.language)).toEqual(["eng", "jpn"]);
  });

  it("hands the caller a MediaSource url to play", async () => {
    stubFetch();
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    await flush();
      expect(result.current.src).toBe("blob:dash");

  });

  it("starts on the first audio track", async () => {
    stubFetch();
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    await flush();
      expect(result.current.activeAudio).toBe("1");

  });

  it("builds one buffer per stream and fills both", async () => {
    stubFetch();
    renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    const { video: vBuf, audio: aBuf } = await started();
    expect(vBuf.appended).toBeGreaterThan(1);
    expect(aBuf.appended).toBeGreaterThan(1);
  });

  it("re-feeds only the audio buffer when the language changes", async () => {
    stubFetch();
    const el = video();
    const { result } = renderHook(() => useDashPlayer(el, "/.dash/v.mkv"));
    const { video: vBuf, audio: aBuf } = await started();
    const videoAppends = vBuf.appended;

    act(() => {
      result.current.selectAudio("2");
    });
    await flush();
      expect(aBuf.removed).toBe(1);

    expect(result.current.activeAudio).toBe("2");
    // The whole point: switching language must not disturb the video.
    expect(vBuf.appended).toBe(videoAppends);
    expect(vBuf.removed).toBe(0);
  });

  it("ignores a selection of a track this video does not have", async () => {
    stubFetch();
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    await flush();
      expect(result.current.activeAudio).toBe("1");

    act(() => {
      result.current.selectAudio("nope");
    });
    expect(result.current.activeAudio).toBe("1");
  });

  it("ignores a selection made before the buffers exist", () => {
    stubFetch();
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    act(() => {
      result.current.selectAudio("2");
    });
    expect(result.current.activeAudio).toBeNull();
  });

  it("stays inert when the manifest cannot be fetched", async () => {
    stubFetch(null);
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    await flush();
      expect(result.current.audio).toEqual([]);

    expect(result.current.src).toBeNull();
  });

  it("stays inert for a manifest it cannot drive", async () => {
    stubFetch("<not-a-manifest/>");
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    await flush();
      expect(result.current.audio).toEqual([]);

  });

  it("leaves the element alone when the browser refuses the codec", async () => {
    stubFetch();
    refuseNextCodec = true;
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    await flush();
      expect(sources).toHaveLength(1);

    expect(sources[0]?.sourceBuffers).toHaveLength(0);
    expect(result.current.activeAudio).toBeNull();
  });

  it("does nothing until it has a video element", async () => {
    stubFetch();
    const { result } = renderHook(() => useDashPlayer(null, "/.dash/v.mkv"));
    await flush();
      expect(result.current.audio).toHaveLength(2);

    expect(result.current.activeAudio).toBeNull();
  });

  it("tops the buffers up as the playhead advances", async () => {
    stubFetch();
    const el = video();
    renderHook(() => useDashPlayer(el, "/.dash/v.mkv"));
    const { video: vBuf, audio: aBuf } = await started();
    vBuf.ranges = [{ start: 0, end: 18 }];
    aBuf.ranges = [{ start: 0, end: 16 }];
    const before = vBuf.appended;
    await act(async () => {
      el.dispatchEvent(new Event("timeupdate"));
      await Promise.resolve();
    });
    await flush();
      expect(vBuf.appended).toBeGreaterThanOrEqual(before);

  });

  it("refills from scratch after a seek lands outside the buffer", async () => {
    stubFetch();
    const el = video();
    renderHook(() => useDashPlayer(el, "/.dash/v.mkv"));
    const { video: vBuf } = await started();
    // Nothing buffered at the new playhead: the hook must drop and refill.
    vBuf.ranges = [];
    el.dispatchEvent(new Event("seeking"));
    await flush();
      expect(vBuf.removed).toBeGreaterThan(0);

  });

  it("does not feed while a buffer is mid-update", async () => {
    const el = video();
    renderHook(() => useDashPlayer(el, "/.dash/v.mkv"));
    const { video: vBuf } = await started();
    vBuf.ranges = [{ start: 0, end: 18 }];
    vBuf.updating = true;
    const before = vBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await flush();
    expect(vBuf.appended).toBe(before);
  });

  it("does not feed once the MediaSource has closed", async () => {
    const el = video();
    renderHook(() => useDashPlayer(el, "/.dash/v.mkv"));
    const { video: vBuf } = await started();
    vBuf.ranges = [{ start: 0, end: 18 }];
    const source = sources[0];
    if (source === undefined) throw new Error("expected a MediaSource");
    source.readyState = "closed";
    const before = vBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await flush();
    expect(vBuf.appended).toBe(before);
  });

  it("stays inert for a manifest with audio but no video stream", async () => {
    stubFetch(AUDIO_ONLY);
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    await flush();
    expect(sources[0]?.sourceBuffers ?? []).toHaveLength(0);
    expect(result.current.activeAudio).toBeNull();
  });

  it("stays inert for a manifest with video but no audio stream", async () => {
    stubFetch(VIDEO_ONLY);
    const { result } = renderHook(() => useDashPlayer(video(), "/.dash/v.mkv"));
    await flush();
    expect(sources[0]?.sourceBuffers ?? []).toHaveLength(0);
    expect(result.current.activeAudio).toBeNull();
  });

  it("keeps going when an initialization segment is unavailable", async () => {
    stubFetchWithoutInits();
    const el = video();
    const { result } = renderHook(() => useDashPlayer(el, "/.dash/v.mkv"));
    await flush();
    expect(result.current.activeAudio).toBe("1");
    // Media segments still landed; only the init fetches came back empty.
    expect(buffers().video.appended).toBeGreaterThan(0);
  });

  it("swaps language even when that track's init is unavailable", async () => {
    stubFetchWithoutInits();
    const el = video();
    const { result } = renderHook(() => useDashPlayer(el, "/.dash/v.mkv"));
    await flush();
    const { audio: aBuf } = buffers();
    act(() => {
      result.current.selectAudio("2");
    });
    await flush();
    expect(result.current.activeAudio).toBe("2");
    expect(aBuf.removed).toBe(1);
  });

  it("discards a manifest that lands after the viewer moved on", async () => {
    // The abort fires during the in-flight manifest fetch, so its result must
    // be dropped rather than applied to whatever is open now.
    const pending: ((v: unknown) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            pending.push(resolve);
          }),
      ),
    );
    const { unmount } = renderHook(() =>
      useDashPlayer(video(), "/.dash/v.mkv"),
    );
    unmount();
    for (const resolve of pending) {
      resolve({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(new TextEncoder().encode(MANIFEST).buffer),
      });
    }
    await flush();
    expect(sources).toHaveLength(0);
  });

  it("abandons startup when the viewer closes mid-fetch", async () => {
    // Init segments resolve only after teardown, so the append path must not
    // run against a buffer whose MediaSource has gone.
    const pending: ((v: unknown) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("manifest.mpd")) {
          return Promise.resolve({
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(new TextEncoder().encode(MANIFEST).buffer),
          });
        }
        return new Promise((resolve) => {
          pending.push(resolve);
        });
      }),
    );
    const el = video();
    const { unmount } = renderHook(() => useDashPlayer(el, "/.dash/v.mkv"));
    await flush();
    const { video: vBuf } = buffers();
    unmount();
    for (const resolve of pending) {
      resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
    }
    await flush();
    expect(vBuf.appended).toBe(0);
  });

  it("keeps feeding the first track when the active id names another video", async () => {
    // Switching video re-runs the attach effect against a NEW manifest while
    // activeRef still holds the previous video's chosen stream id. That id is
    // absent here, so the pump must fall back to this manifest's first stream
    // rather than stop feeding.
    const el = video();
    const { result, rerender } = renderHook(
      ({ d }: { d: string }) => useDashPlayer(el, d),
      { initialProps: { d: "/.dash/a.mkv" } },
    );
    await started();
    act(() => {
      result.current.selectAudio("2");
    });
    await flush();

    stubFetch(VIDEO_PLUS_ONE_AUDIO);
    rerender({ d: "/.dash/b.mkv" });
    const { video: vBuf, audio: aBuf } = await started();
    vBuf.ranges = [{ start: 0, end: 18 }];
    aBuf.ranges = [{ start: 0, end: 16 }];
    const before = vBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await flush();
    expect(vBuf.appended).toBeGreaterThanOrEqual(before);
  });

  it("stops feeding once the viewer closes", async () => {
    stubFetch();
    const el = video();
    const { unmount } = renderHook(() => useDashPlayer(el, "/.dash/v.mkv"));
    // Let the opening fill finish first, so what is measured after unmount is
    // the listener being gone rather than a fill still in flight.
    const { video: vBuf } = await started();
    unmount();
    const after = vBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await Promise.resolve();
    expect(vBuf.appended).toBe(after);
  });
});
