import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaViewer } from "./media-viewer.tsx";
import type { DirEntry, SubtitleManifest } from "../api/types.ts";

// jassub is a WASM+worker renderer jsdom cannot run; its own lifecycle is
// covered in use-jassub.test.ts.
vi.mock("jassub", () => ({
  default: class {
    timeOffset = 0;
    destroy = () => Promise.resolve();
  },
}));

function mk(name: string): DirEntry {
  return { name, path: `/${name}`, kind: "file", size: 1, mtimeMs: 0 };
}

const manifest: SubtitleManifest = {
  generatedMs: 0,
  fonts: [],
  tracks: [
    {
      si: 0,
      codec: "ass",
      lang: "eng",
      title: "",
      default: false,
      file: "00.eng.ass",
    },
  ],
};

describe("MediaViewer", () => {
  it("shows an image and toggles zoom on click", async () => {
    render(
      <MediaViewer
        entry={mk("a.jpg")}
        url="/a.jpg"
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const img = screen.getByAltText("a.jpg");
    expect(img.className).not.toContain("zoomed");
    await userEvent.click(img);
    expect(img.className).toContain("zoomed");
  });

  it("renders a <video> for video files and does not close on video click", () => {
    const onClose = vi.fn();
    render(
      <MediaViewer
        entry={mk("v.mp4")}
        url="/v.mp4"
        onClose={onClose}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    if (video) fireEvent.click(video);
    // stopPropagation keeps the stage's onClose from firing.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders an <iframe> for PDFs and does not close on click", () => {
    const onClose = vi.fn();
    render(
      <MediaViewer
        entry={mk("doc.pdf")}
        url="/doc.pdf"
        onClose={onClose}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const frame = document.querySelector("iframe");
    expect(frame).not.toBeNull();
    if (frame) fireEvent.click(frame);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders an <audio> player for audio files and does not close on click", () => {
    const onClose = vi.fn();
    render(
      <MediaViewer
        entry={mk("song.mp3")}
        url="/song.mp3"
        onClose={onClose}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const audio = document.querySelector("audio");
    expect(audio).not.toBeNull();
    if (audio) fireEvent.click(audio.parentElement ?? audio);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("offers a download for non-media files", () => {
    render(
      <MediaViewer
        entry={mk("x.bin")}
        url="/x.bin"
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("Download")).toBeInTheDocument();
  });

  it("responds to keyboard: Esc/←/→", () => {
    const onClose = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <MediaViewer
        entry={mk("a.jpg")}
        url="/a.jpg"
        onClose={onClose}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "a" });
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("nav buttons and stage click work", async () => {
    const onClose = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <MediaViewer
        entry={mk("a.jpg")}
        url="/a.jpg"
        onClose={onClose}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );
    await userEvent.click(screen.getByLabelText("Previous"));
    await userEvent.click(screen.getByLabelText("Next"));
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("leaves arrow keys to the video once it has focus, so seeking works", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const { container } = render(
      <MediaViewer
        entry={mk("a.mp4")}
        url="/a.mp4"
        onClose={vi.fn()}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );
    const video = container.querySelector("video");
    fireEvent.keyDown(video as Element, { key: "ArrowLeft" });
    fireEvent.keyDown(video as Element, { key: "ArrowRight" });
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("still closes on Escape while the video has focus", () => {
    const onClose = vi.fn();
    const { container } = render(
      <MediaViewer
        entry={mk("a.mp4")}
        url="/a.mp4"
        onClose={onClose}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    fireEvent.keyDown(container.querySelector("video") as Element, {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers a subtitle picker for a video with extracted tracks", () => {
    render(
      <MediaViewer
        entry={mk("a.mp4")}
        url="/a.mp4"
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        subtitlesPath="/.subs/a.mp4"
        subtitleManifest={manifest}
      />,
    );
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent("English");
  });

  it("shows no subtitle picker for a video without any tracks", () => {
    render(
      <MediaViewer
        entry={mk("a.mp4")}
        url="/a.mp4"
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Subtitles")).not.toBeInTheDocument();
  });

  it("shows no subtitle picker for non-video media", () => {
    render(
      <MediaViewer
        entry={mk("a.jpg")}
        url="/a.jpg"
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        subtitlesPath="/.subs/a.jpg"
        subtitleManifest={manifest}
      />,
    );
    expect(screen.queryByLabelText("Subtitles")).not.toBeInTheDocument();
  });
});
