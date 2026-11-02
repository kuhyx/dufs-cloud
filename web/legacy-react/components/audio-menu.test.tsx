import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AudioMenu, audioLabel } from "./audio-menu.tsx";
import type { DashStream } from "../lib/dash-manifest.ts";

function stream(id: string, language: string): DashStream {
  return {
    id,
    contentType: "audio",
    language,
    mimeCodec: 'audio/mp4; codecs="mp4a.40.2"',
    segments: [{ start: 0, duration: 6 }],
  };
}

const ENG = stream("1", "eng");
const JPN = stream("2", "jpn");

describe("audioLabel", () => {
  it("names the language", () => {
    expect(audioLabel(ENG, 0)).toBe("English");
    expect(audioLabel(JPN, 1)).toBe("Japanese");
  });

  it("falls back to a track number when the muxer tagged no language", () => {
    expect(audioLabel(stream("3", ""), 2)).toBe("Track 3");
  });

  it("shows an unknown tag rather than hiding it", () => {
    expect(audioLabel(stream("4", "zzz"), 0)).toBe("zzz");
  });
});

describe("AudioMenu", () => {
  it("renders nothing when there is no second language to pick", () => {
    const { container } = render(
      <AudioMenu tracks={[ENG]} active="1" onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a video with no audio streams at all", () => {
    const { container } = render(
      <AudioMenu tracks={[]} active={null} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the toggle with the playing language", () => {
    render(<AudioMenu tracks={[ENG, JPN]} active="2" onSelect={vi.fn()} />);
    expect(screen.getByLabelText("Audio track")).toHaveTextContent("Japanese");
  });

  it("labels the toggle generically before a track is chosen", () => {
    render(<AudioMenu tracks={[ENG, JPN]} active={null} onSelect={vi.fn()} />);
    expect(screen.getByLabelText("Audio track")).toHaveTextContent("Audio");
  });

  it("lists every language once opened", async () => {
    const user = userEvent.setup();
    render(<AudioMenu tracks={[ENG, JPN]} active="1" onSelect={vi.fn()} />);
    await user.click(screen.getByLabelText("Audio track"));
    expect(screen.getByRole("menuitemradio", { name: "English" })).toBeChecked();
    expect(
      screen.getByRole("menuitemradio", { name: "Japanese" }),
    ).not.toBeChecked();
  });

  it("selects a language and closes", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AudioMenu tracks={[ENG, JPN]} active="1" onSelect={onSelect} />);
    await user.click(screen.getByLabelText("Audio track"));
    await user.click(screen.getByRole("menuitemradio", { name: "Japanese" }));
    expect(onSelect).toHaveBeenCalledWith("2");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes again when the toggle is clicked twice", async () => {
    const user = userEvent.setup();
    render(<AudioMenu tracks={[ENG, JPN]} active="1" onSelect={vi.fn()} />);
    await user.click(screen.getByLabelText("Audio track"));
    await user.click(screen.getByLabelText("Audio track"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not let a click inside the panel close the viewer", async () => {
    const user = userEvent.setup();
    const onBackground = vi.fn();
    render(
      <div onClick={onBackground}>
        <AudioMenu tracks={[ENG, JPN]} active="1" onSelect={vi.fn()} />
      </div>,
    );
    await user.click(screen.getByLabelText("Audio track"));
    expect(onBackground).not.toHaveBeenCalled();
  });
});
