import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashPlayer } from "./use-dash-player.ts";
import {
  AUDIO_ONLY,
  VIDEO_ONLY,
  buffers,
  flush,
  installDashFakes,
  started,
  stubFetch,
  stubFetchWithoutInits,
  video,
} from "../test/dash-player-fixtures.ts";
import { sources, refuseNextCodec } from "../test/dash-fakes.ts";

installDashFakes();

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
    refuseNextCodec();
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
});
