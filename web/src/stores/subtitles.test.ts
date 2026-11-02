import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createSubtitles, type SubtitleInput } from "./subtitles.ts";
import { entry, file } from "../test/subtitle-fixtures.ts";
import type { DirEntry, SubtitleManifest } from "../api/types.ts";

const video = file("Show - 01.mkv");
const SUBS = "/.subs/Media/Show - 01.mkv";
const ENC = "/.subs/Media/Show%20-%2001.mkv";

const manifest: SubtitleManifest = {
  generatedMs: 0,
  fonts: ["a.ttf", "b.ttf"],
  tracks: [
    entry({ si: 0, lang: "eng" }),
    entry({ si: 9, lang: "pol", file: "09.pol.ass" }),
  ],
};

function input(
  man: SubtitleManifest | null = manifest,
  siblings: readonly DirEntry[] = [],
  subtitlesPath: string | null = SUBS,
): SubtitleInput {
  return { entry: video, siblings, subtitlesPath, manifest: man };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSubtitles", () => {
  it("collects embedded tracks from the manifest", () => {
    expect(createSubtitles(input()).getState().tracks).toHaveLength(2);
  });

  it("collects sidecar tracks from the sibling listing", () => {
    const { tracks } = createSubtitles(
      input(null, [file("Show - 01.pol.ass")]),
    ).getState();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.source).toBe("sidecar");
  });

  it("auto-enables English on first open", () => {
    expect(createSubtitles(input()).getState().active?.language).toBe("eng");
  });

  it("resolves font URLs under the subtitles directory, percent-encoded", () => {
    expect(createSubtitles(input()).getState().fonts).toEqual([
      `${ENC}/fonts/a.ttf`,
      `${ENC}/fonts/b.ttf`,
    ]);
    const spaced = createSubtitles(
      input({ ...manifest, fonts: ["PLASTIC TOMATO.TTF"] }),
    );
    expect(spaced.getState().fonts).toEqual([`${ENC}/fonts/PLASTIC%20TOMATO.TTF`]);
  });

  it("has no fonts without extracted subtitles or without a manifest", () => {
    expect(createSubtitles(input(null, [], null)).getState().fonts).toEqual([]);
    expect(createSubtitles(input(null)).getState().fonts).toEqual([]);
    expect(createSubtitles(input(manifest, [], null)).getState().fonts).toEqual(
      [],
    );
  });

  it("remembers a chosen language across videos", () => {
    const first = createSubtitles(input());
    first.select(first.getState().tracks[1] ?? null);
    expect(localStorage.getItem("subtitle-preference")).toBe("pol");
    expect(first.getState().active?.language).toBe("pol");

    expect(createSubtitles(input()).getState().active?.language).toBe("pol");
  });

  it("remembers subtitles being turned off", () => {
    const first = createSubtitles(input());
    first.select(null);
    expect(localStorage.getItem("subtitle-preference")).toBe("off");
    expect(first.getState().active).toBeNull();

    expect(createSubtitles(input()).getState().active).toBeNull();
  });

  it("falls back to the automatic pick when the remembered language is absent", () => {
    localStorage.setItem("subtitle-preference", "kor");
    expect(createSubtitles(input()).getState().active?.language).toBe("eng");
  });

  it("never restores a forced track from the preference", () => {
    localStorage.setItem("subtitle-preference", "eng");
    const forced: SubtitleManifest = {
      generatedMs: 0,
      fonts: [],
      tracks: [entry({ lang: "eng", title: "signs/songs" })],
    };
    expect(createSubtitles(input(forced)).getState().active).toBeNull();
  });

  it("keeps the selection when given an equivalent sibling list", () => {
    const subs = createSubtitles(input(manifest, [file("Show - 01.pol.ass")]));
    subs.select(subs.getState().tracks[1] ?? null);
    const chosen = subs.getState().active?.id;
    subs.setInput(input(manifest, [file("Show - 01.pol.ass")]));
    expect(subs.getState().active?.id).toBe(chosen);
  });

  it("keeps the same state object when the input did not change", () => {
    const same = input();
    const subs = createSubtitles(same);
    const before = subs.getState();
    let notified = 0;
    subs.subscribe(() => {
      notified++;
    });
    subs.setInput({ ...same });
    expect(subs.getState()).toBe(before);
    expect(notified).toBe(0);
  });

  it("falls back to the automatic pick when the chosen track is not in this video", () => {
    const subs = createSubtitles(input());
    subs.select(subs.getState().tracks[1] ?? null);
    expect(subs.getState().active?.language).toBe("pol");

    subs.setInput(
      input({
        generatedMs: 0,
        fonts: [],
        tracks: [entry({ si: 0, lang: "eng" })],
      }),
    );
    expect(subs.getState().active?.language).toBe("eng");
  });

  it("tracks the offset", () => {
    const subs = createSubtitles(input());
    subs.setOffsetMs(250);
    expect(subs.getState().offsetMs).toBe(250);
  });

  it("dispose() is harmless", () => {
    const subs = createSubtitles(input());
    expect(() => {
      subs.dispose();
    }).not.toThrow();
  });

  it("still works when localStorage reads throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(createSubtitles(input()).getState().active?.language).toBe("eng");
  });

  it("still works when localStorage writes throw", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const subs = createSubtitles(input());
    expect(() => {
      subs.select(null);
    }).not.toThrow();
    expect(subs.getState().active).toBeNull();
  });
});
