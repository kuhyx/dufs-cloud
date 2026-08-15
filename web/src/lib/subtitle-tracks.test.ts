import { describe, it, expect } from "vitest";
import {
  allTracks,
  embeddedTracks,
  sidecarTracks,
} from "./subtitles.ts";
import { entry, file, manifest } from "../test/subtitle-fixtures.ts";

describe("embeddedTracks", () => {
  const man = manifest([
    entry({ si: 0, lang: "eng", title: "NF" }),
    entry({ si: 9, lang: "pol", file: "09.pol.ass", default: true }),
  ]);

  it("is empty without a path or a manifest", () => {
    expect(embeddedTracks(null, man)).toEqual([]);
    expect(embeddedTracks("/.subs/v.mkv", null)).toEqual([]);
  });

  it("resolves each track's URL under the subtitles directory", () => {
    const got = embeddedTracks("/.subs/v.mkv", man);
    expect(got).toHaveLength(2);
    expect(got[0]?.url).toBe("/.subs/v.mkv/00.eng.ass");
    expect(got[1]?.url).toBe("/.subs/v.mkv/09.pol.ass");
  });

  it("keys tracks by their subtitle-stream index", () => {
    const got = embeddedTracks("/.subs/v.mkv", man);
    expect(got[1]?.id).toBe("embedded:9");
  });

  it("carries the default flag and language through", () => {
    const got = embeddedTracks("/.subs/v.mkv", man);
    expect(got[1]?.isDefault).toBe(true);
    expect(got[1]?.language).toBe("pol");
    expect(got[0]?.isDefault).toBe(false);
  });

  it("treats an untagged language as absent rather than showing 'und'", () => {
    const got = embeddedTracks("/.subs/v.mkv", manifest([entry({ lang: "und" })]));
    expect(got[0]?.language).toBe("");
  });

  it("infers forced from the muxed title", () => {
    const got = embeddedTracks(
      "/.subs/v.mkv",
      manifest([entry({ title: "signs/songs" })]),
    );
    expect(got[0]?.isForced).toBe(true);
  });
});

describe("sidecarTracks", () => {
  const video = file("Show - 01.mkv");

  it("matches a bare sidecar sharing the basename", () => {
    const got = sidecarTracks(video, [video, file("Show - 01.ass")]);
    expect(got).toHaveLength(1);
    expect(got[0]?.url).toBe("/Media/Show - 01.ass");
    expect(got[0]?.language).toBe("");
    expect(got[0]?.source).toBe("sidecar");
  });

  it("reads a language suffix", () => {
    const got = sidecarTracks(video, [file("Show - 01.pol.ass")]);
    expect(got[0]?.language).toBe("pol");
  });

  it("accepts every renderable subtitle extension", () => {
    const got = sidecarTracks(video, [
      file("Show - 01.ass"),
      file("Show - 01.ssa"),
      file("Show - 01.srt"),
      file("Show - 01.vtt"),
    ]);
    expect(got).toHaveLength(4);
  });

  it("ignores non-subtitle files, directories and other videos", () => {
    const got = sidecarTracks(video, [
      video,
      file("Show - 01.txt"),
      file("Show - 01.sub"),
      { ...file("Show - 01"), kind: "dir" },
    ]);
    expect(got).toEqual([]);
  });

  it("does not let a longer-numbered episode claim a shorter one's subs", () => {
    const one = file("Show - 1.mkv");
    const got = sidecarTracks(one, [file("Show - 10.ass")]);
    expect(got).toEqual([]);
  });

  it("ignores a subtitle belonging to a different show", () => {
    const got = sidecarTracks(video, [file("Other - 01.ass")]);
    expect(got).toEqual([]);
  });

  it("infers forced from the file name", () => {
    const got = sidecarTracks(video, [file("Show - 01.forced.ass")]);
    expect(got[0]?.isForced).toBe(true);
  });

  it("handles an extensionless video name", () => {
    const got = sidecarTracks(file("Show"), [file("Show.pol.ass")]);
    expect(got[0]?.language).toBe("pol");
  });

  it("keys tracks by path so two sidecars stay distinct", () => {
    const got = sidecarTracks(video, [
      file("Show - 01.pol.ass"),
      file("Show - 01.eng.ass"),
    ]);
    expect(new Set(got.map((t) => t.id)).size).toBe(2);
  });
});

describe("allTracks", () => {
  const video = file("Show - 01.mkv");

  it("lists embedded tracks before sidecars", () => {
    const got = allTracks(
      video,
      [file("Show - 01.pol.ass")],
      "/.subs/Show - 01.mkv",
      manifest([entry()]),
    );
    expect(got.map((t) => t.source)).toEqual(["embedded", "sidecar"]);
  });

  it("works with either source absent", () => {
    expect(allTracks(video, [], null, null)).toEqual([]);
    expect(allTracks(video, [file("Show - 01.ass")], null, null)).toHaveLength(
      1,
    );
  });
});
