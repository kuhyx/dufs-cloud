import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { MediaViewer } from "./media-viewer.ts";
import { installDashFakes } from "../test/dash-player-fixtures.ts";
import { mk, must, open, query, resetViewer } from "../test/viewer-fixtures.ts";

vi.mock("jassub", async () => ({
  default: (await import("../test/fake-jassub.ts")).FakeJassub,
}));

installDashFakes();

afterEach(resetViewer);

describe("media-viewer structure", () => {
  it("renders the dialog chrome and caption", () => {
    open("a.jpg");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("overlay", "viewer");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Close")).toHaveClass("viewer-close");
    expect(screen.getByLabelText("Previous")).toHaveClass("viewer-nav", "prev");
    expect(screen.getByLabelText("Next")).toHaveClass("viewer-nav", "next");
    expect(query(".viewer-caption")).toHaveTextContent("a.jpg");
  });

  it("reads its props back", () => {
    const { viewer } = open("a.jpg");
    expect(viewer.entry).toEqual(mk("a.jpg"));
    expect(viewer.url).toBe("/a.jpg");
    expect(viewer.siblings).toEqual([]);
    expect(viewer.subtitlesPath).toBeNull();
    expect(viewer.subtitleManifest).toBeNull();
    expect(viewer.dashPath).toBeNull();
    expect(document.createElement("media-viewer")).toBeInstanceOf(MediaViewer);
  });

  it("keeps the first registration when loaded twice", async () => {
    vi.resetModules();
    await import("./media-viewer.ts");
    expect(customElements.get("media-viewer")).toBe(MediaViewer);
  });

  it("renders nothing without an entry", () => {
    const viewer = new MediaViewer();
    viewer.siblings = [mk("x.mp4")];
    document.body.append(viewer);
    expect(viewer).toBeEmptyDOMElement();
  });

  it("shows an image and toggles zoom on click", async () => {
    const { onClose } = open("a.jpg");
    const img = screen.getByAltText("a.jpg");
    expect(img.className).toBe("viewer-img");
    await userEvent.click(img);
    expect(img.className).toBe("viewer-img zoomed");
    await userEvent.click(img);
    expect(img.className).toBe("viewer-img");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a stage background click", () => {
    const { onClose } = open("a.jpg");
    fireEvent.click(must(".viewer-stage"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders a <video> and does not close on video click", () => {
    const { onClose } = open("v.mp4");
    const video = query("video");
    expect(video).toHaveClass("viewer-video");
    expect(video).toHaveAttribute("src", "/v.mp4");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("autoplay");
    fireEvent.click(must("video"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders an <iframe> for PDFs and does not close on click", () => {
    const { onClose } = open("doc.pdf");
    const frame = query("iframe");
    expect(frame).toHaveClass("viewer-pdf");
    expect(frame).toHaveAttribute("title", "doc.pdf");
    fireEvent.click(must("iframe"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders an <audio> player for audio files and does not close on click", () => {
    const { onClose } = open("song.mp3");
    const audio = query("audio");
    expect(audio).toHaveClass("viewer-audio");
    expect(audio?.parentElement).toHaveClass("viewer-fallback");
    fireEvent.click(must(".viewer-fallback"));
    expect(onClose).not.toHaveBeenCalled();
    expect(query(".viewer-controls")).toBeNull();
  });

  it("offers a download for non-media files", () => {
    open("x.bin");
    const link = screen.getByText("Download");
    expect(link).toHaveAttribute("href", "/x.bin");
    expect(link).toHaveAttribute("download");
  });
});

describe("media-viewer events and keys", () => {
  it("emits close, prev and next from the buttons", async () => {
    const { onClose, onPrev, onNext } = open("a.jpg");
    await userEvent.click(screen.getByLabelText("Close"));
    await userEvent.click(screen.getByLabelText("Previous"));
    await userEvent.click(screen.getByLabelText("Next"));
    const event = onNext.mock.calls[0]?.[0] as CustomEvent;
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("responds to keyboard: Esc/left/right", () => {
    const { onClose, onPrev, onNext } = open("a.jpg");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "a" });
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("leaves arrow keys to the video once it has focus, so seeking works", () => {
    const { onPrev, onNext } = open("a.mp4");
    const video = must("video");
    fireEvent.keyDown(video, { key: "ArrowLeft" });
    fireEvent.keyDown(video, { key: "ArrowRight" });
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("still closes on Escape while the video has focus", () => {
    const { onClose } = open("a.mp4");
    fireEvent.keyDown(must("video"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stops listening for keys once removed, and resumes when re-attached", () => {
    const { viewer, onClose } = open("a.jpg");
    viewer.remove();
    expect(viewer).toBeEmptyDOMElement();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    document.body.append(viewer);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
