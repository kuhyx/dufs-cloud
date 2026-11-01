import { describe, it, expect, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import { makeClient } from "../test/gallery-fixtures.ts";

beforeEach(() => {
  window.location.hash = "";
});

describe("Gallery select", () => {
  it("shift-clicks a checkbox to range-select from the anchor", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Sorted (dirs first, then name asc): Media, clip.mp4, notes.txt, pic.jpg.
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    fireEvent.click(screen.getByLabelText("Select pic.jpg"), {
      shiftKey: true,
    });
    // clip.mp4..pic.jpg inclusive = clip.mp4, notes.txt, pic.jpg (not Media).
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(
      screen.getByLabelText<HTMLInputElement>("Select clip.mp4").checked,
    ).toBe(true);
    expect(
      screen.getByLabelText<HTMLInputElement>("Select notes.txt").checked,
    ).toBe(true);
    expect(
      screen.getByLabelText<HTMLInputElement>("Select Media").checked,
    ).toBe(false);
  });

  it("renders the box you just clicked as checked, not only its neighbours",
    async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Regression: cancelling the click to read modifier keys desynced the
    // input from React's value tracker, so the clicked box alone rendered
    // unchecked while the app counted it as selected.
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(
      screen.getByLabelText<HTMLInputElement>("Select clip.mp4").checked,
    ).toBe(true);
    // Same for the shift-clicked endpoint, which is the other clicked box.
    fireEvent.click(screen.getByLabelText("Select pic.jpg"), {
      shiftKey: true,
    });
    expect(
      screen.getByLabelText<HTMLInputElement>("Select pic.jpg").checked,
    ).toBe(true);
    // And unchecking again must clear it rather than stick.
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    expect(
      screen.getByLabelText<HTMLInputElement>("Select pic.jpg").checked,
    ).toBe(false);
  });

  it("re-anchors on each shift-click, so a later one ranges from there", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    // Anchor -> pic.jpg. Range pic.jpg..clip.mp4 adds notes.txt + clip.mp4.
    fireEvent.click(screen.getByLabelText("Select clip.mp4"), {
      shiftKey: true,
    });
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    // Anchor is now clip.mp4 (not pic.jpg): ranging to Media only adds
    // Media itself, since clip.mp4..Media already covers what's selected.
    fireEvent.click(screen.getByLabelText("Select Media"), {
      shiftKey: true,
    });
    expect(screen.getByText("4 selected")).toBeInTheDocument();
  });

  it("falls back to a plain toggle when the anchor scrolled out of view", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    // Filtering clip.mp4 out of view invalidates it as a range endpoint;
    // the shift-click below must fall back to a plain toggle of notes.txt
    // instead of throwing or ranging against a stale index.
    await userEvent.type(screen.getByLabelText("Filter by name"), "notes");
    // The query is debounced: wait until clip.mp4 has actually left the view.
    await waitFor(
      () => {
        expect(screen.queryByLabelText("Select clip.mp4")).toBeNull();
      },
      { timeout: 3000 },
    );
    const notesBoxes = await screen.findAllByLabelText(
      "Select notes.txt",
      {},
      { timeout: 3000 },
    );
    const notesBox = notesBoxes.at(0);
    expect(notesBox).toBeDefined();
    if (notesBox) fireEvent.click(notesBox, { shiftKey: true });
    // clip.mp4 is still selected in state but no longer displayed, so the
    // visible count only reflects notes.txt (displayed ∩ selected).
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("plain click still just toggles one item after a shift-click", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    fireEvent.click(screen.getByLabelText("Select pic.jpg"), {
      shiftKey: true,
    });
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Select notes.txt"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("toggles a tile's checkbox off again", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    const box = screen.getByLabelText("Select pic.jpg");
    await userEvent.click(box);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    // Clicking the same checkbox removes it from the selection set.
    await userEvent.click(box);
    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("clears a selection with the Clear button", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("drops the selection when navigating into a folder", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Media"));
    await waitFor(() => {
      expect(screen.queryByText("1 selected")).toBeNull();
    });
  });
});
