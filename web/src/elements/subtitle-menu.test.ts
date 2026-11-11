import { afterEach, describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { SubtitleMenu, OFFSET_STEP_MS } from "./subtitle-menu.ts";
import { track } from "../test/subtitle-fixtures.ts";
import type { SubtitleTrack } from "../lib/subtitles.ts";

const eng = track();
const pol = track({
  id: "embedded:9",
  url: "/.subs/v.mkv/09.pol.ass",
  language: "pol",
});

function mount(
  tracks: SubtitleTrack[] = [eng, pol],
  active: SubtitleTrack | null = null,
  offsetMs = 0,
): { menu: SubtitleMenu; onSelect: Mock; onOffset: Mock } {
  const menu = new SubtitleMenu();
  menu.tracks = tracks;
  menu.active = active;
  menu.offsetMs = offsetMs;
  document.body.append(menu);
  const onSelect = vi.fn();
  const onOffset = vi.fn();
  menu.addEventListener("select", onSelect);
  menu.addEventListener("offset-change", onOffset);
  return { menu, onSelect, onOffset };
}

type Mock = ReturnType<typeof vi.fn>;

function detail(mock: Mock, call = 0): unknown {
  return (mock.mock.calls[call]?.[0] as CustomEvent<unknown>).detail;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("subtitle-menu", () => {
  it("keeps the first registration when loaded twice", async () => {
    vi.resetModules();
    await import("./subtitle-menu.ts");
    expect(customElements.get("subtitle-menu")).toBe(SubtitleMenu);
  });

  it("reads its props back", () => {
    const { menu } = mount([eng], pol, 300);
    expect(menu.tracks).toEqual([eng]);
    expect(menu.active).toBe(pol);
    expect(menu.offsetMs).toBe(300);
    expect(document.createElement("subtitle-menu")).toBeInstanceOf(
      SubtitleMenu,
    );
  });

  it("renders nothing when the video has no subtitle tracks", () => {
    expect(mount([]).menu).toBeEmptyDOMElement();
  });

  it("shows 'Off' on the toggle when no track is active", () => {
    mount();
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent("💬 ⊘");
  });

  it("shows the active track's label on the toggle", () => {
    mount([eng, pol], pol);
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent("Polish");
  });

  it("keeps the panel closed until the toggle is pressed, then toggles it", async () => {
    mount();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Subtitles")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByLabelText("Subtitles")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("lists every track plus an Off entry", async () => {
    mount();
    await userEvent.click(screen.getByLabelText("Subtitles"));
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual([
      "⊘",
      "English",
      "Polish",
    ]);
    expect(items[0]).toHaveAccessibleName("Off");
  });

  it("marks the active track as checked", async () => {
    mount([eng, pol], pol);
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.getByRole("menuitemradio", { name: "Polish" })).toHaveClass(
      "is-active",
    );
    expect(
      screen.getByRole("menuitemradio", { name: "English" }),
    ).not.toHaveClass("is-active");
    expect(screen.getByRole("menuitemradio", { name: "Off" })).not.toBeChecked();
  });

  it("marks Off as checked when nothing is active", async () => {
    mount();
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.getByRole("menuitemradio", { name: "Off" })).toHaveClass(
      "is-active",
    );
  });

  it("selects a track and closes", async () => {
    const { onSelect } = mount();
    await userEvent.click(screen.getByLabelText("Subtitles"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Polish" }));
    expect(detail(onSelect)).toBe(pol);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("turns subtitles off and closes", async () => {
    const { onSelect } = mount([eng, pol], pol);
    await userEvent.click(screen.getByLabelText("Subtitles"));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Off" }));
    expect(detail(onSelect)).toBeNull();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("nudges the offset in both directions", async () => {
    const { onOffset } = mount([eng, pol], null, 500);
    await userEvent.click(screen.getByLabelText("Subtitles"));
    await userEvent.click(screen.getByLabelText("Subtitles later"));
    expect(detail(onOffset, 0)).toBe(500 + OFFSET_STEP_MS);
    await userEvent.click(screen.getByLabelText("Subtitles earlier"));
    expect(detail(onOffset, 1)).toBe(500 - OFFSET_STEP_MS);
  });

  it("shows the current offset in seconds and keeps focus on a nudge", async () => {
    const { menu } = mount([eng, pol], null, -1500);
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.getByText("-1.5s")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Subtitles later"));
    menu.offsetMs = -1400;
    expect(screen.getByText("-1.4s")).toBeInTheDocument();
    expect(screen.getByLabelText("Subtitles later")).toHaveFocus();
  });

  it("does not let a click reach the viewer's close-on-background handler", async () => {
    const onBackground = vi.fn();
    mount();
    document.body.addEventListener("click", onBackground);
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(onBackground).not.toHaveBeenCalled();
    document.body.removeEventListener("click", onBackground);
  });
});
