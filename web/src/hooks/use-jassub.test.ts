import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

/** jassub is a WASM+worker renderer that jsdom cannot run, so the boundary is
 * mocked: these tests pin the lifecycle this hook is responsible for (build on
 * track change, tear down on unmount, nudge the offset in place). */
const construct = vi.fn();
const destroy = vi.fn(() => Promise.resolve());
/** Every renderer built during a test, newest last, so assertions can inspect
 * the live instance the hook is mutating. */
const built: { timeOffset: number }[] = [];

vi.mock("jassub", () => ({
  default: class {
    timeOffset = 0;
    destroy = destroy;
    constructor(opts: unknown) {
      construct(opts);
      built.push(this);
    }
  },
}));

const { useJassub } = await import("./use-jassub.ts");
type SubtitleTrack = import("../lib/subtitles.ts").SubtitleTrack;

function track(over: Partial<SubtitleTrack> = {}): SubtitleTrack {
  return {
    id: "embedded:0",
    url: "/.subs/v.mkv/00.eng.ass",
    language: "eng",
    title: "",
    isDefault: false,
    isForced: false,
    source: "embedded",
    ...over,
  };
}

function video(): HTMLVideoElement {
  return document.createElement("video");
}

beforeEach(() => {
  construct.mockClear();
  destroy.mockClear();
  built.length = 0;
});

describe("useJassub", () => {
  it("does nothing without a video element", () => {
    renderHook(() => {
      useJassub(null, track(), "", 0);
    });
    expect(construct).not.toHaveBeenCalled();
  });

  it("does nothing when subtitles are off", () => {
    renderHook(() => {
      useJassub(video(), null, "", 0);
    });
    expect(construct).not.toHaveBeenCalled();
  });

  it("builds a renderer for the selected track", () => {
    const el = video();
    renderHook(() => {
      useJassub(el, track(), "", 0);
    });
    expect(construct).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledWith(
      expect.objectContaining({
        video: el,
        subUrl: "/.subs/v.mkv/00.eng.ass",
        fonts: [],
      }),
    );
  });

  it("passes the extracted font URLs through", () => {
    renderHook(() => {
      useJassub(video(), track(), "/f/a.ttf /f/b.ttf", 0);
    });
    expect(construct).toHaveBeenCalledWith(
      expect.objectContaining({ fonts: ["/f/a.ttf", "/f/b.ttf"] }),
    );
  });

  it("tears the renderer down on unmount", () => {
    const { unmount } = renderHook(() => {
      useJassub(video(), track(), "", 0);
    });
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("swallows a teardown that races the worker going away", () => {
    destroy.mockImplementationOnce(() => Promise.reject(new Error("gone")));
    const { unmount } = renderHook(() => {
      useJassub(video(), track(), "", 0);
    });
    expect(() => {
      unmount();
    }).not.toThrow();
  });

  it("rebuilds when the track changes", () => {
    const el = video();
    const { rerender } = renderHook(
      ({ t }: { t: SubtitleTrack }) => {
        useJassub(el, t, "", 0);
      },
      { initialProps: { t: track() } },
    );
    expect(construct).toHaveBeenCalledTimes(1);
    rerender({ t: track({ id: "embedded:9", url: "/x.ass" }) });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledTimes(2);
  });

  it("does not rebuild when only the offset changes", () => {
    const el = video();
    const t = track();
    const { rerender } = renderHook(
      ({ ms }: { ms: number }) => {
        useJassub(el, t, "", ms);
      },
      { initialProps: { ms: 0 } },
    );
    rerender({ ms: 500 });
    expect(construct).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("applies the offset to the live renderer in seconds", () => {
    const el = video();
    const t = track();
    const { rerender } = renderHook(
      ({ ms }: { ms: number }) => {
        useJassub(el, t, "", ms);
      },
      { initialProps: { ms: 0 } },
    );
    rerender({ ms: -1500 });
    expect(built.at(-1)?.timeOffset).toBe(-1.5);
  });

  it("ignores an offset change while nothing is rendering", () => {
    const { rerender } = renderHook(
      ({ ms }: { ms: number }) => {
        useJassub(null, null, "", ms);
      },
      { initialProps: { ms: 0 } },
    );
    expect(() => {
      rerender({ ms: 300 });
    }).not.toThrow();
  });
});
