import { describe, it, expect, vi } from "vitest";
import { createDashPlayer, type DashPlayer } from "./dash-player.ts";
import {
  AUDIO_ONLY,
  VIDEO_ONLY,
  VIDEO_PLUS_ONE_AUDIO,
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

const DIR = "/.dash/v.mkv";

type Dir = string | null;
function open(el: HTMLVideoElement | null = video(), dir: Dir = DIR): DashPlayer {
  const player = createDashPlayer();
  player.setSource(el, dir);
  return player;
}

describe("createDashPlayer", () => {
  it("stays inert without a dash path", () => {
    const player = open(video(), null);
    expect(player.getState().audio).toEqual([]);
    expect(player.getState().src).toBeNull();
  });

  it("exposes one selectable stream per audio language", async () => {
    const player = open();
    await flush();
    expect(player.getState().audio.map((s) => s.language)).toEqual([
      "eng",
      "jpn",
    ]);
  });

  it("hands the caller a MediaSource url to play", async () => {
    const player = open();
    await flush();
    expect(player.getState().src).toBe("blob:dash");
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const player = createDashPlayer();
    const listener = vi.fn();
    const off = player.subscribe(listener);
    player.setSource(video(), DIR);
    await flush();
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    player.setSource(video(), null);
    expect(listener).not.toHaveBeenCalled();
  });

  it("starts on the first audio track", async () => {
    const player = open();
    await flush();
    expect(player.getState().activeAudio).toBe("1");
  });

  it("builds one buffer per stream and fills both", async () => {
    open();
    const { video: vBuf, audio: aBuf } = await started();
    expect(vBuf.appended).toBeGreaterThan(1);
    expect(aBuf.appended).toBeGreaterThan(1);
  });

  it("re-feeds only the audio buffer when the language changes", async () => {
    const player = open();
    const { video: vBuf, audio: aBuf } = await started();
    const videoAppends = vBuf.appended;
    player.selectAudio("2");
    await flush();
    expect(aBuf.removed).toBe(1);
    expect(player.getState().activeAudio).toBe("2");
    expect(vBuf.appended).toBe(videoAppends);
    expect(vBuf.removed).toBe(0);
  });

  it("keeps the state object when the active track is reselected", async () => {
    const player = open();
    await flush();
    const before = player.getState();
    player.selectAudio("1");
    expect(player.getState()).toBe(before);
  });

  it("ignores a selection of a track this video does not have", async () => {
    const player = open();
    await flush();
    player.selectAudio("nope");
    expect(player.getState().activeAudio).toBe("1");
  });

  it("ignores a selection made before the buffers exist", () => {
    const player = open();
    player.selectAudio("2");
    expect(player.getState().activeAudio).toBeNull();
  });

  it("ignores a selection once the video element is gone", async () => {
    const player = open();
    await flush();
    player.setSource(null, DIR);
    player.selectAudio("2");
    expect(player.getState().activeAudio).toBe("1");
  });

  it("stays inert when the manifest cannot be fetched", async () => {
    stubFetch(null);
    const player = open();
    await flush();
    expect(player.getState().audio).toEqual([]);
    expect(player.getState().src).toBeNull();
  });

  it("stays inert for a manifest it cannot drive", async () => {
    stubFetch("<not-a-manifest/>");
    const player = open();
    await flush();
    expect(player.getState().audio).toEqual([]);
    expect(player.getState().activeAudio).toBeNull();
  });

  it("leaves the element alone when the browser refuses the codec", async () => {
    refuseNextCodec();
    const player = open();
    await flush();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.sourceBuffers).toHaveLength(0);
    expect(player.getState().activeAudio).toBeNull();
  });

  it("does nothing until it has a video element", async () => {
    const player = open(null);
    await flush();
    expect(player.getState().audio).toHaveLength(2);
    expect(player.getState().activeAudio).toBeNull();
    expect(sources[0]?.sourceBuffers).toHaveLength(0);
  });

  it("starts once the video element arrives", async () => {
    const player = open(null);
    await flush();
    player.setSource(video(), DIR);
    await flush();
    expect(player.getState().activeAudio).toBe("1");
  });

  it("stays inert for a manifest with audio but no video stream", async () => {
    stubFetch(AUDIO_ONLY);
    const player = open();
    await flush();
    expect(sources[0]?.sourceBuffers ?? []).toHaveLength(0);
    expect(player.getState().activeAudio).toBeNull();
  });

  it("stays inert for a manifest with video but no audio stream", async () => {
    stubFetch(VIDEO_ONLY);
    const player = open();
    await flush();
    expect(sources[0]?.sourceBuffers ?? []).toHaveLength(0);
    expect(player.getState().activeAudio).toBeNull();
  });

  it("keeps going when an initialization segment is unavailable", async () => {
    stubFetchWithoutInits();
    const player = open();
    await flush();
    expect(player.getState().activeAudio).toBe("1");
    expect(buffers().video.appended).toBeGreaterThan(0);
  });

  it("swaps language even when that track's init is unavailable", async () => {
    stubFetchWithoutInits();
    const player = open();
    await flush();
    const { audio: aBuf } = buffers();
    player.selectAudio("2");
    await flush();
    expect(player.getState().activeAudio).toBe("2");
    expect(aBuf.removed).toBe(1);
  });
});

describe("createDashPlayer lifecycle", () => {
  it("resets the active track and src when the manifest changes", async () => {
    const player = open();
    await started();
    player.selectAudio("2");
    await flush();
    stubFetch(VIDEO_PLUS_ONE_AUDIO);
    player.setSource(video(), "/.dash/b.mkv");
    expect(player.getState().activeAudio).toBeNull();
    expect(player.getState().src).toBeNull();
    await flush();
    expect(player.getState().activeAudio).toBe("1");
    expect(player.getState().audio).toHaveLength(1);
  });

  it("revokes the object url when the manifest changes", async () => {
    const player = open();
    await flush();
    player.setSource(video(), null);
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith("blob:dash");
  });

  it("keeps the object url on a mere video change", async () => {
    const first = video();
    const player = open(first);
    await started();
    player.setSource(video(), DIR);
    expect(vi.mocked(URL.revokeObjectURL)).not.toHaveBeenCalled();
    expect(player.getState().src).toBe("blob:dash");
    expect(player.getState().activeAudio).toBe("1");
  });

  it("revokes the object url on dispose", async () => {
    const player = open();
    await flush();
    player.dispose();
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith("blob:dash");
  });

  it("disposes safely with nothing attached", () => {
    const player = createDashPlayer();
    expect(() => {
      player.dispose();
    }).not.toThrow();
    expect(vi.mocked(URL.revokeObjectURL)).not.toHaveBeenCalled();
  });

  it("ignores the manifest clearing after dispose", async () => {
    const player = open();
    await flush();
    player.dispose();
    vi.mocked(URL.revokeObjectURL).mockClear();
    player.setSource(null, null);
    expect(vi.mocked(URL.revokeObjectURL)).not.toHaveBeenCalled();
  });
});
