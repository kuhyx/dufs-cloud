import { describe, it, expect, vi, beforeEach } from "vitest";

const construct = vi.fn();
const destroy = vi.fn(() => Promise.resolve());
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

const { createJassub } = await import("./jassub.ts");
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

describe("createJassub", () => {
  it("does nothing without a video element", () => {
    createJassub().update({ video: null, track: track(), fonts: [] });
    expect(construct).not.toHaveBeenCalled();
  });

  it("does nothing when subtitles are off", () => {
    createJassub().update({ video: video(), track: null, fonts: [] });
    expect(construct).not.toHaveBeenCalled();
  });

  it("builds a renderer for the selected track", () => {
    const el = video();
    createJassub().update({ video: el, track: track(), fonts: [] });
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
    createJassub().update({
      video: video(),
      track: track(),
      fonts: ["/f/a.ttf", "/f/b.ttf"],
    });
    expect(construct).toHaveBeenCalledWith(
      expect.objectContaining({ fonts: ["/f/a.ttf", "/f/b.ttf"] }),
    );
  });

  it("keeps font URLs containing spaces intact", () => {
    const fonts = ["/.subs/Show - 01.mkv/fonts/PLASTIC TOMATO.TTF"];
    createJassub().update({ video: video(), track: track(), fonts });
    expect(construct).toHaveBeenCalledWith(expect.objectContaining({ fonts }));
  });

  it("does not rebuild when the font list is recreated with equal contents", () => {
    const jassub = createJassub();
    const el = video();
    const t = track();
    jassub.update({ video: el, track: t, fonts: ["/f/a.ttf"] });
    jassub.update({ video: el, track: t, fonts: ["/f/a.ttf"] });
    expect(construct).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("rebuilds when the font list changes", () => {
    const jassub = createJassub();
    const el = video();
    const t = track();
    jassub.update({ video: el, track: t, fonts: ["/f/a.ttf"] });
    jassub.update({ video: el, track: t, fonts: ["/f/a.ttf", "/f/b.ttf"] });
    expect(construct).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("rebuilds when the track changes", () => {
    const jassub = createJassub();
    const el = video();
    jassub.update({ video: el, track: track(), fonts: [] });
    jassub.update({
      video: el,
      track: track({ id: "embedded:9", url: "/x.ass" }),
      fonts: [],
    });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledTimes(2);
  });

  it("rebuilds when the video changes", () => {
    const jassub = createJassub();
    const t = track();
    jassub.update({ video: video(), track: t, fonts: [] });
    jassub.update({ video: video(), track: t, fonts: [] });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledTimes(2);
  });

  it("tears down when subtitles are switched off", () => {
    const jassub = createJassub();
    const el = video();
    jassub.update({ video: el, track: track(), fonts: [] });
    jassub.update({ video: el, track: null, fonts: [] });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledTimes(1);
  });

  it("tears the renderer down on dispose", () => {
    const jassub = createJassub();
    jassub.update({ video: video(), track: track(), fonts: [] });
    jassub.dispose();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("disposes safely with nothing built", () => {
    createJassub().dispose();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("swallows a teardown that races the worker going away", async () => {
    destroy.mockImplementationOnce(() => Promise.reject(new Error("gone")));
    const jassub = createJassub();
    jassub.update({ video: video(), track: track(), fonts: [] });
    expect(() => {
      jassub.dispose();
    }).not.toThrow();
    await Promise.resolve();
  });
});

describe("createJassub offset", () => {
  it("does not rebuild when only the offset changes", () => {
    const jassub = createJassub();
    jassub.update({ video: video(), track: track(), fonts: [] });
    jassub.setOffsetMs(500);
    expect(construct).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("applies the offset to the live renderer in seconds", () => {
    const jassub = createJassub();
    jassub.update({ video: video(), track: track(), fonts: [] });
    jassub.setOffsetMs(-1500);
    expect(built.at(-1)?.timeOffset).toBe(-1.5);
  });

  it("ignores an offset change while nothing is rendering", () => {
    expect(() => {
      createJassub().setOffsetMs(300);
    }).not.toThrow();
  });

  it("applies an earlier offset to a renderer built later", () => {
    const jassub = createJassub();
    jassub.setOffsetMs(2000);
    jassub.update({ video: video(), track: track(), fonts: [] });
    expect(built.at(-1)?.timeOffset).toBe(2);
  });
});
