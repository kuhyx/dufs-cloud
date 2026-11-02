import { describe, it, expect, vi } from "vitest";
import { createDashPlayer } from "./dash-player.ts";
import {
  MANIFEST,
  VIDEO_PLUS_ONE_AUDIO,
  buffers,
  flush,
  installDashFakes,
  started,
  stubFetch,
  video,
} from "../test/dash-player-fixtures.ts";
import { sources } from "../test/dash-fakes.ts";

installDashFakes();

const DIR = "/.dash/v.mkv";

function open(el: HTMLVideoElement, dir = DIR) {
  const player = createDashPlayer();
  player.setSource(el, dir);
  return player;
}

function manifestResponse(): unknown {
  return {
    ok: true,
    arrayBuffer: () =>
      Promise.resolve(new TextEncoder().encode(MANIFEST).buffer),
  };
}

describe("createDashPlayer feeding", () => {
  it("tops the buffers up as the playhead advances", async () => {
    const el = video();
    open(el);
    const { video: vBuf, audio: aBuf } = await started();
    vBuf.ranges = [{ start: 0, end: 18 }];
    aBuf.ranges = [{ start: 0, end: 16 }];
    const before = vBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await flush();
    expect(vBuf.appended).toBeGreaterThanOrEqual(before);
    expect(vBuf.removed).toBe(0);
  });

  it("refills from scratch after a seek lands outside the buffer", async () => {
    const el = video();
    open(el);
    const { video: vBuf, audio: aBuf } = await started();
    vBuf.ranges = [];
    const before = vBuf.appended;
    el.dispatchEvent(new Event("seeking"));
    await flush();
    expect(vBuf.removed).toBeGreaterThan(0);
    expect(aBuf.removed).toBeGreaterThan(0);
    expect(vBuf.appended).toBeGreaterThan(before);
  });

  it("does not feed while the video buffer is mid-update", async () => {
    const el = video();
    open(el);
    const { video: vBuf } = await started();
    vBuf.ranges = [{ start: 0, end: 18 }];
    vBuf.updating = true;
    const before = vBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await flush();
    expect(vBuf.appended).toBe(before);
  });

  it("does not feed while the audio buffer is mid-update", async () => {
    const el = video();
    open(el);
    const { video: vBuf, audio: aBuf } = await started();
    vBuf.ranges = [{ start: 0, end: 18 }];
    aBuf.updating = true;
    const before = vBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await flush();
    expect(vBuf.appended).toBe(before);
  });

  it("does not feed once the MediaSource has closed", async () => {
    const el = video();
    open(el);
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

  it("feeds the swapped track after a language change", async () => {
    const el = video();
    const player = open(el);
    const { video: vBuf, audio: aBuf } = await started();
    player.selectAudio("2");
    await flush();
    vBuf.ranges = [{ start: 0, end: 18 }];
    aBuf.ranges = [{ start: 0, end: 16 }];
    const before = aBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await flush();
    expect(aBuf.appended).toBeGreaterThanOrEqual(before);
    expect(aBuf.removed).toBe(1);
  });

  it("discards a manifest that lands after dispose", async () => {
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
    const player = open(video());
    player.dispose();
    for (const resolve of pending) resolve(manifestResponse());
    await flush();
    expect(sources).toHaveLength(0);
    expect(player.getState().src).toBeNull();
  });

  it("abandons startup when disposed mid-fetch", async () => {
    const pending: ((v: unknown) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("manifest.mpd")) {
          return Promise.resolve(manifestResponse());
        }
        return new Promise((resolve) => {
          pending.push(resolve);
        });
      }),
    );
    const player = open(video());
    await flush();
    const { video: vBuf } = buffers();
    player.dispose();
    for (const resolve of pending) {
      resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
      });
    }
    await flush();
    expect(vBuf.appended).toBe(0);
  });

  it("keeps feeding the first track after moving to another video", async () => {
    const el = video();
    const player = open(el, "/.dash/a.mkv");
    await started();
    player.selectAudio("2");
    await flush();

    stubFetch(VIDEO_PLUS_ONE_AUDIO);
    player.setSource(el, "/.dash/b.mkv");
    const { video: vBuf, audio: aBuf } = await started();
    vBuf.ranges = [{ start: 0, end: 18 }];
    aBuf.ranges = [{ start: 0, end: 16 }];
    const before = vBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await flush();
    expect(vBuf.appended).toBeGreaterThanOrEqual(before);
    expect(player.getState().activeAudio).toBe("1");
  });

  it("stops feeding the old element once the video changes", async () => {
    const first = video();
    const player = open(first);
    const { video: vBuf } = await started();
    player.setSource(video(), DIR);
    vBuf.ranges = [];
    const after = vBuf.removed;
    first.dispatchEvent(new Event("seeking"));
    await flush();
    expect(vBuf.removed).toBe(after);
  });

  it("stops feeding once disposed", async () => {
    const el = video();
    const player = open(el);
    const { video: vBuf } = await started();
    player.dispose();
    const after = vBuf.appended;
    el.dispatchEvent(new Event("timeupdate"));
    await Promise.resolve();
    expect(vBuf.appended).toBe(after);
  });
});
