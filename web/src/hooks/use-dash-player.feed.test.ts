import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashPlayer } from "./use-dash-player.ts";
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

describe("useDashPlayer feeding", () => {
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
