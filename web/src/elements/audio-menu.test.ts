import { afterEach, describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { AudioMenu, audioLabel, audioShortLabel } from "./audio-menu.ts";
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

function mount(tracks: DashStream[], active: string | null): AudioMenu {
  const menu = new AudioMenu();
  menu.tracks = tracks;
  menu.active = active;
  document.body.append(menu);
  return menu;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("audioLabel", () => {
  it("names the language", () => {
    expect(audioLabel(ENG, 0)).toBe("English");
    expect(audioLabel(JPN, 1)).toBe("Japanese");
  });

  it("falls back to a track number when the muxer tagged no language", () => {
    expect(audioLabel(stream("3", ""), 2)).toBe("Track 3");
    expect(audioShortLabel(stream("3", ""), 2)).toBe("#3");
    expect(audioShortLabel(ENG, 0)).toBe("English");
  });

  it("shows an unknown tag rather than hiding it", () => {
    expect(audioLabel(stream("4", "zzz"), 0)).toBe("zzz");
  });
});

describe("audio-menu", () => {
  it("keeps the first registration when loaded twice", async () => {
    vi.resetModules();
    await import("./audio-menu.ts");
    expect(customElements.get("audio-menu")).toBe(AudioMenu);
  });

  it("is registered once and reads its props back", () => {
    const menu = mount([ENG, JPN], "1");
    expect(document.createElement("audio-menu")).toBeInstanceOf(AudioMenu);
    expect(menu.tracks).toEqual([ENG, JPN]);
    expect(menu.active).toBe("1");
  });

  it("renders nothing when there is no second language to pick", () => {
    expect(mount([ENG], "1")).toBeEmptyDOMElement();
  });

  it("renders nothing for a video with no audio streams at all", () => {
    expect(mount([], null)).toBeEmptyDOMElement();
  });

  it("labels the toggle with the playing language", () => {
    mount([ENG, JPN], "2");
    expect(screen.getByLabelText("Audio track")).toHaveTextContent("Japanese");
  });

  it("labels the toggle generically before a track is chosen", () => {
    mount([ENG, JPN], null);
    expect(screen.getByLabelText("Audio track").textContent).toBe("🔊");
  });

  it("lists every language once opened", async () => {
    const user = userEvent.setup();
    mount([ENG, JPN], "1");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Audio track"));
    expect(screen.getByLabelText("Audio track")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "English" })).toBeChecked();
    expect(
      screen.getByRole("menuitemradio", { name: "English" }),
    ).toHaveClass("is-active");
    expect(
      screen.getByRole("menuitemradio", { name: "Japanese" }),
    ).not.toBeChecked();
  });

  it("selects a language, emits select and closes", async () => {
    const user = userEvent.setup();
    const menu = mount([ENG, JPN], "1");
    const onSelect = vi.fn();
    document.body.addEventListener("select", onSelect);
    await user.click(screen.getByLabelText("Audio track"));
    await user.click(screen.getByRole("menuitemradio", { name: "Japanese" }));
    expect(onSelect).toHaveBeenCalledOnce();
    const event = onSelect.mock.calls[0]?.[0] as CustomEvent<string>;
    expect(event.detail).toBe("2");
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(event.target).toBe(menu);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes again when the toggle is clicked twice", async () => {
    const user = userEvent.setup();
    mount([ENG, JPN], "1");
    await user.click(screen.getByLabelText("Audio track"));
    await user.click(screen.getByLabelText("Audio track"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps focus on the toggle across a re-render", async () => {
    const user = userEvent.setup();
    const menu = mount([ENG, JPN], "1");
    await user.click(screen.getByLabelText("Audio track"));
    menu.active = "2";
    expect(screen.getByLabelText("Audio track")).toHaveFocus();
    expect(screen.getByLabelText("Audio track")).toHaveTextContent("Japanese");
  });

  it("does not let a click inside the panel close the viewer", async () => {
    const user = userEvent.setup();
    const onBackground = vi.fn();
    mount([ENG, JPN], "1");
    document.body.addEventListener("click", onBackground);
    await user.click(screen.getByLabelText("Audio track"));
    expect(onBackground).not.toHaveBeenCalled();
    document.body.removeEventListener("click", onBackground);
  });
});
