import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtitleMenu, OFFSET_STEP_MS } from "./subtitle-menu.tsx";
import type { SubtitleTrack } from "../lib/subtitles.ts";

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

const eng = track();
const pol = track({
  id: "embedded:9",
  url: "/.subs/v.mkv/09.pol.ass",
  language: "pol",
});

function setup(over: Partial<Parameters<typeof SubtitleMenu>[0]> = {}) {
  const onSelect = vi.fn();
  const onOffsetChange = vi.fn();
  render(
    <SubtitleMenu
      tracks={[eng, pol]}
      active={null}
      onSelect={onSelect}
      offsetMs={0}
      onOffsetChange={onOffsetChange}
      {...over}
    />,
  );
  return { onSelect, onOffsetChange };
}

describe("SubtitleMenu", () => {
  it("renders nothing when the video has no subtitle tracks", () => {
    const { container } = render(
      <SubtitleMenu
        tracks={[]}
        active={null}
        onSelect={vi.fn()}
        offsetMs={0}
        onOffsetChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'Off' on the toggle when no track is active", () => {
    setup();
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent(
      "Subtitles: Off",
    );
  });

  it("shows the active track's label on the toggle", () => {
    setup({ active: pol });
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent("Polish");
  });

  it("keeps the panel closed until the toggle is pressed", async () => {
    setup();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes the panel when the toggle is pressed again", async () => {
    setup();
    const toggle = screen.getByLabelText("Subtitles");
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("lists every track plus an Off entry", async () => {
    setup();
    await userEvent.click(screen.getByLabelText("Subtitles"));
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual([
      "Off",
      "English",
      "Polish",
    ]);
  });

  it("marks the active track as checked", async () => {
    setup({ active: pol });
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.getByRole("menuitemradio", { name: "Polish" })).toHaveClass(
      "is-active",
    );
    expect(screen.getByRole("menuitemradio", { name: "English" })).not.toHaveClass(
      "is-active",
    );
  });

  it("marks Off as checked when nothing is active", async () => {
    setup();
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.getByRole("menuitemradio", { name: "Off" })).toHaveClass(
      "is-active",
    );
  });

  it("selects a track and closes", async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByLabelText("Subtitles"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Polish" }));
    expect(onSelect).toHaveBeenCalledWith(pol);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("turns subtitles off and closes", async () => {
    const { onSelect } = setup({ active: pol });
    await userEvent.click(screen.getByLabelText("Subtitles"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Off" }));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("nudges the offset in both directions", async () => {
    const { onOffsetChange } = setup({ offsetMs: 500 });
    await userEvent.click(screen.getByLabelText("Subtitles"));
    await userEvent.click(screen.getByLabelText("Subtitles later"));
    expect(onOffsetChange).toHaveBeenCalledWith(500 + OFFSET_STEP_MS);
    await userEvent.click(screen.getByLabelText("Subtitles earlier"));
    expect(onOffsetChange).toHaveBeenCalledWith(500 - OFFSET_STEP_MS);
  });

  it("shows the current offset in seconds", async () => {
    setup({ offsetMs: -1500 });
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.getByText("-1.5s")).toBeInTheDocument();
  });

  it("does not let a click reach the viewer's close-on-background handler", async () => {
    const onBackground = vi.fn();
    render(
      <div onClick={onBackground}>
        <SubtitleMenu
          tracks={[eng]}
          active={null}
          onSelect={vi.fn()}
          offsetMs={0}
          onOffsetChange={vi.fn()}
        />
      </div>,
    );
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(onBackground).not.toHaveBeenCalled();
  });
});
