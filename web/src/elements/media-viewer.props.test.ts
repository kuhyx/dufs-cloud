import { afterEach, describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MediaViewer } from "./media-viewer.ts";
import { installDashFakes, flush } from "../test/dash-player-fixtures.ts";
import { jassub } from "../test/fake-jassub.ts";
import { manifest, mk, open, query, resetViewer } from "../test/viewer-fixtures.ts";

vi.mock("jassub", async () => ({
  default: (await import("../test/fake-jassub.ts")).FakeJassub,
}));

installDashFakes();

afterEach(resetViewer);

describe("media-viewer props", () => {
  it("updates the url in place for each media kind", () => {
    const image = open("a.jpg");
    const img = query("img");
    image.viewer.url = "/b.jpg";
    expect(query("img")).toBe(img);
    expect(img).toHaveAttribute("src", "/b.jpg");
    document.body.replaceChildren();

    const other = open("x.bin");
    other.viewer.url = "/y.bin";
    expect(screen.getByText("Download")).toHaveAttribute("href", "/y.bin");
  });

  it("swaps a video's src when the url changes, and keeps its element", () => {
    const { viewer } = open("a.mp4");
    const video = query("video");
    viewer.url = "/proxy/a.mp4";
    expect(query("video")).toBe(video);
    expect(video).toHaveAttribute("src", "/proxy/a.mp4");
  });

  it("remounts for a new path but not for the same path", () => {
    const { viewer } = open("a.jpg");
    const dialog = screen.getByRole("dialog");
    viewer.entry = mk("a.jpg");
    expect(screen.getByRole("dialog")).toBe(dialog);
    viewer.url = "/b.jpg";
    viewer.entry = mk("b.jpg");
    expect(screen.getByRole("dialog")).not.toBe(dialog);
    expect(screen.getByAltText("b.jpg")).toHaveAttribute("src", "/b.jpg");
    viewer.entry = null;
    expect(viewer).toBeEmptyDOMElement();
  });

  it("accepts an entry before it is attached", () => {
    const viewer = new MediaViewer();
    viewer.entry = mk("a.jpg");
    expect(viewer).toBeEmptyDOMElement();
  });
});

describe("media-viewer subtitles", () => {
  const props = { subtitlesPath: "/.subs/a.mp4", subtitleManifest: manifest };

  it("offers a subtitle picker for a video with extracted tracks", () => {
    open("a.mp4", props);
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent("English");
    expect(query(".viewer-controls")).not.toBeNull();
  });

  it("shows no subtitle picker for a video without any tracks", () => {
    open("a.mp4");
    expect(screen.queryByLabelText("Subtitles")).not.toBeInTheDocument();
  });

  it("shows no subtitle picker for non-video media", () => {
    open("a.jpg", props);
    expect(screen.queryByLabelText("Subtitles")).not.toBeInTheDocument();
  });

  it("picks up subtitle props that arrive after mounting", () => {
    const { viewer } = open("a.mp4");
    viewer.siblings = [];
    viewer.subtitlesPath = "/.subs/a.mp4";
    viewer.subtitleManifest = manifest;
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent("English");
    expect(jassub.made.map((j) => j.subUrl)).toContain(
      "/.subs/a.mp4/00.eng.ass",
    );
  });

  it("switches track, remembers it, and keeps menu events inside", async () => {
    open("a.mp4", props);
    const leaked = vi.fn();
    document.addEventListener("select", leaked);
    await userEvent.click(screen.getByLabelText("Subtitles"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Polish" }));
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent("Polish");
    expect(jassub.made.at(-1)?.subUrl).toBe("/.subs/a.mp4/01.pol.ass");
    expect(localStorage.getItem("subtitle-preference")).toBe("pol");
    await userEvent.click(screen.getByLabelText("Subtitles"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Off" }));
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent("Subtitles: Off");
    expect(leaked).not.toHaveBeenCalled();
    document.removeEventListener("select", leaked);
  });

  it("nudges the subtitle offset on the live renderer", async () => {
    open("a.mp4", props);
    await userEvent.click(screen.getByLabelText("Subtitles"));
    await userEvent.click(screen.getByLabelText("Subtitles later"));
    expect(screen.getByText("0.1s")).toBeInTheDocument();
    expect(jassub.made.at(-1)?.timeOffset).toBeCloseTo(0.1);
  });

  it("destroys the renderer when removed", async () => {
    const { viewer } = open("a.mp4", props);
    viewer.remove();
    await flush();
    expect(jassub.destroyed).toBe(1);
  });
});

describe("media-viewer audio tracks", () => {
  it("plays through MediaSource and switches language", async () => {
    const { viewer } = open("v.mp4", { dashPath: "/.dash/v.mp4" });
    expect(query("video")).toHaveAttribute("src", "/v.mp4");
    await flush();
    expect(query("video")).toHaveAttribute("src", "blob:dash");
    expect(screen.getByLabelText("Audio track")).toHaveTextContent("English");
    await userEvent.click(screen.getByLabelText("Audio track"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Japanese" }));
    await flush();
    expect(screen.getByLabelText("Audio track")).toHaveTextContent("Japanese");
    viewer.remove();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:dash");
  });

  it("starts playing the DASH stream when the path arrives later", async () => {
    const { viewer } = open("v.mp4");
    viewer.dashPath = "/.dash/v.mp4";
    await flush();
    expect(query("video")).toHaveAttribute("src", "blob:dash");
  });
});
