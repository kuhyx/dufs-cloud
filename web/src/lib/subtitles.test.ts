import { describe, it, expect } from "vitest";
import {
  isEnglish,
  looksForcedTitle,
  pickDefaultSubtitle,
  subtitleLabel,
} from "./subtitles.ts";
import { track } from "../test/subtitle-fixtures.ts";

describe("isEnglish", () => {
  it("accepts the tags seen in the wild, case-insensitively", () => {
    for (const tag of ["en", "eng", "English", "en-US", "en-gb"]) {
      expect(isEnglish(tag)).toBe(true);
    }
  });
  it("rejects other languages and the empty tag", () => {
    for (const tag of ["pol", "jpn", "", "e"]) {
      expect(isEnglish(tag)).toBe(false);
    }
  });
});

describe("looksForcedTitle", () => {
  it("matches the library's forced/signs conventions", () => {
    expect(looksForcedTitle("signs/songs")).toBe(true);
    expect(looksForcedTitle("Forced")).toBe(true);
    expect(looksForcedTitle("English subs")).toBe(false);
  });
});

describe("subtitleLabel", () => {
  it("expands a known language tag to its name", () => {
    expect(subtitleLabel(track({ language: "pol" }))).toBe("Polish");
  });
  it("falls back to the raw tag when unknown", () => {
    expect(subtitleLabel(track({ language: "zzz" }))).toBe("zzz");
  });
  it("joins language and title when both add information", () => {
    expect(subtitleLabel(track({ language: "eng", title: "NF" }))).toBe(
      "English — NF",
    );
  });
  it("does not repeat a title identical to the language name", () => {
    expect(subtitleLabel(track({ language: "eng", title: "English" }))).toBe(
      "English",
    );
  });
  it("shows the title alone when there is no language", () => {
    expect(subtitleLabel(track({ language: "", title: "Foxtrot" }))).toBe(
      "Foxtrot",
    );
  });
  it("falls back to the handle when nothing else identifies it", () => {
    expect(
      subtitleLabel(track({ id: "embedded:3", language: "", title: "" })),
    ).toBe("Track embedded:3");
  });
  it("marks forced tracks", () => {
    expect(
      subtitleLabel(
        track({ language: "eng", title: "signs/songs", isForced: true }),
      ),
    ).toBe("English — signs/songs (forced)");
  });
});

describe("pickDefaultSubtitle", () => {
  it("returns null when there is nothing to pick", () => {
    expect(pickDefaultSubtitle([])).toBeNull();
  });
  it("prefers a default-flagged English track", () => {
    const want = track({ id: "b", language: "eng", isDefault: true });
    const got = pickDefaultSubtitle([
      track({ id: "a", language: "eng" }),
      want,
    ]);
    expect(got?.id).toBe("b");
  });
  it("falls back to any English track", () => {
    const got = pickDefaultSubtitle([
      track({ id: "a", language: "pol", isDefault: true }),
      track({ id: "b", language: "eng" }),
    ]);
    expect(got?.id).toBe("b");
  });
  it("falls back to a default-flagged track when no English exists", () => {
    const got = pickDefaultSubtitle([
      track({ id: "a", language: "tha" }),
      track({ id: "b", language: "pol", isDefault: true }),
    ]);
    expect(got?.id).toBe("b");
  });
  it("never silently picks an arbitrary foreign track", () => {
    const got = pickDefaultSubtitle([
      track({ id: "a", language: "tha" }),
      track({ id: "b", language: "pol" }),
    ]);
    expect(got).toBeNull();
  });
  it("skips forced tracks when choosing automatically", () => {
    const got = pickDefaultSubtitle([
      track({ id: "a", language: "eng", title: "signs", isForced: true }),
      track({ id: "b", language: "eng" }),
    ]);
    expect(got?.id).toBe("b");
  });
  it("returns null when every track is forced", () => {
    expect(
      pickDefaultSubtitle([
        track({ id: "a", language: "eng", isForced: true }),
      ]),
    ).toBeNull();
  });
});
