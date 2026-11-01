import { vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import {
  FakeMediaSource,
  FakeSourceBuffer,
  resetFakes,
  sources,
} from "./dash-fakes.ts";

export const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
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
export const AUDIO_ONLY = MANIFEST.replace(
  /<AdaptationSet id="0"[\s\S]*?<\/AdaptationSet>/,
  "",
);
export const VIDEO_ONLY = MANIFEST.replace(
  /<AdaptationSet id="[12]"[\s\S]*?<\/AdaptationSet>/g,
  "",
);

/** Video plus a single audio stream (id "1"), so an id of "2" held over from a
 * previous video does not resolve against it. */
export const VIDEO_PLUS_ONE_AUDIO = MANIFEST.replace(
  /<AdaptationSet id="2"[\s\S]*?<\/AdaptationSet>/,
  "",
);

export function stubFetch(manifest: string | null = MANIFEST): void {
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
export function stubFetchWithoutInits(): void {
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

export function video(): HTMLVideoElement {
  return document.createElement("video");
}

export function buffers(): { video: FakeSourceBuffer; audio: FakeSourceBuffer } {
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
export async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 200; i++) await Promise.resolve();
  });
}

export async function started(): Promise<{
  video: FakeSourceBuffer;
  audio: FakeSourceBuffer;
}> {
  await flush();
  return buffers();
}

/** Registers the per-test setup: fake MediaSource + fetch, restored after. */
export function installDashFakes(): void {
  beforeEach(() => {
    resetFakes();
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
}
