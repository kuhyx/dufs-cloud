import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSubtitles } from "./use-subtitles.ts";
import type {
  DirEntry,
  SubtitleManifest,
  SubtitleTrackEntry,
} from "../api/types.ts";

function file(name: string, dir = "/Media"): DirEntry {
  return { name, path: `${dir}/${name}`, kind: "file", size: 1, mtimeMs: 0 };
}

function entry(over: Partial<SubtitleTrackEntry> = {}): SubtitleTrackEntry {
  return {
    si: 0,
    codec: "ass",
    lang: "eng",
    title: "",
    default: false,
    file: "00.eng.ass",
    ...over,
  };
}

const video = file("Show - 01.mkv");
const SUBS = "/.subs/Media/Show - 01.mkv";

const manifest: SubtitleManifest = {
  generatedMs: 0,
  fonts: ["a.ttf", "b.ttf"],
  tracks: [
    entry({ si: 0, lang: "eng" }),
    entry({ si: 9, lang: "pol", file: "09.pol.ass" }),
  ],
};

function run(
  man: SubtitleManifest | null = manifest,
  siblings: readonly DirEntry[] = [],
) {
  return renderHook(() => useSubtitles(video, siblings, SUBS, man));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSubtitles", () => {
  it("collects embedded tracks from the manifest", () => {
    const { result } = run();
    expect(result.current.tracks).toHaveLength(2);
  });

  it("collects sidecar tracks from the sibling listing", () => {
    const { result } = run(null, [file("Show - 01.pol.ass")]);
    expect(result.current.tracks).toHaveLength(1);
    expect(result.current.tracks[0]?.source).toBe("sidecar");
  });

  it("auto-enables English on first open", () => {
    const { result } = run();
    expect(result.current.active?.language).toBe("eng");
  });

  it("resolves font URLs under the subtitles directory", () => {
    const { result } = run();
    // Percent-encoded per segment: this directory name contains spaces, and
    // libass fetches these URLs verbatim.
    expect(result.current.fonts).toEqual([
      "/.subs/Media/Show%20-%2001.mkv/fonts/a.ttf",
      "/.subs/Media/Show%20-%2001.mkv/fonts/b.ttf",
    ]);
  });

  it("encodes font file names that themselves contain spaces", () => {
    const { result } = run({
      ...manifest,
      fonts: ["PLASTIC TOMATO.TTF"],
    });
    expect(result.current.fonts).toEqual([
      "/.subs/Media/Show%20-%2001.mkv/fonts/PLASTIC%20TOMATO.TTF",
    ]);
  });

  it("has no fonts when the video has no extracted subtitles", () => {
    const { result } = renderHook(() => useSubtitles(video, [], null, null));
    expect(result.current.fonts).toEqual([]);
  });

  it("remembers a chosen language across videos", () => {
    const first = run();
    act(() => {
      first.result.current.select(first.result.current.tracks[1] ?? null);
    });
    expect(localStorage.getItem("subtitle-preference")).toBe("pol");

    // A different video with the same languages should open in Polish.
    const second = run();
    expect(second.result.current.active?.language).toBe("pol");
  });

  it("remembers subtitles being turned off", () => {
    const first = run();
    act(() => {
      first.result.current.select(null);
    });
    expect(localStorage.getItem("subtitle-preference")).toBe("off");

    const second = run();
    expect(second.result.current.active).toBeNull();
  });

  it("falls back to the automatic pick when the remembered language is absent", () => {
    localStorage.setItem("subtitle-preference", "kor");
    const { result } = run();
    expect(result.current.active?.language).toBe("eng");
  });

  it("never restores a forced track from the preference", () => {
    localStorage.setItem("subtitle-preference", "eng");
    const { result } = renderHook(() =>
      useSubtitles(video, [], SUBS, {
        generatedMs: 0,
        fonts: [],
        tracks: [entry({ lang: "eng", title: "signs/songs" })],
      }),
    );
    expect(result.current.active).toBeNull();
  });

  it("keeps the selection when re-rendered with an equivalent sibling list", () => {
    // Callers routinely pass a freshly-built array every render. Keying the
    // reset on identity rather than content spun this into an endless
    // render loop that exhausted the heap.
    const { result, rerender } = renderHook(
      ({ sibs }: { sibs: DirEntry[] }) =>
        useSubtitles(video, sibs, SUBS, manifest),
      { initialProps: { sibs: [file("Show - 01.pol.ass")] } },
    );
    act(() => {
      result.current.select(result.current.tracks[1] ?? null);
    });
    const chosen = result.current.active?.id;
    rerender({ sibs: [file("Show - 01.pol.ass")] });
    expect(result.current.active?.id).toBe(chosen);
  });

  it("falls back to the automatic pick when the chosen track is not in this video", () => {
    const { result, rerender } = renderHook(
      ({ man }: { man: SubtitleManifest }) =>
        useSubtitles(video, [], SUBS, man),
      { initialProps: { man: manifest } },
    );
    act(() => {
      result.current.select(result.current.tracks[1] ?? null);
    });
    expect(result.current.active?.language).toBe("pol");

    // Next episode carries only English: the Polish id no longer resolves.
    rerender({
      man: {
        generatedMs: 0,
        fonts: [],
        tracks: [entry({ si: 0, lang: "eng" })],
      },
    });
    expect(result.current.active?.language).toBe("eng");
  });

  it("tracks the offset", () => {
    const { result } = run();
    act(() => {
      result.current.setOffsetMs(250);
    });
    expect(result.current.offsetMs).toBe(250);
  });

  it("still works when localStorage reads throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = run();
    expect(result.current.active?.language).toBe("eng");
  });

  it("still works when localStorage writes throw", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = run();
    expect(() => {
      act(() => {
        result.current.select(null);
      });
    }).not.toThrow();
    expect(result.current.active).toBeNull();
  });
});
