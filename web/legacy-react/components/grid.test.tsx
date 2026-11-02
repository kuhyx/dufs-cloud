import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { entries, renderGrid } from "../test/grid-fixtures.tsx";

describe("Grid", () => {
  it("activates dir, media and text entries via their tiles", async () => {
    const onOpenDir = vi.fn();
    const onOpenMedia = vi.fn();
    const onEditText = vi.fn();
    renderGrid({ onOpenDir, onOpenMedia, onEditText });
    await userEvent.click(screen.getByText("Media"));
    await userEvent.click(screen.getByText("pic.jpg"));
    await userEvent.click(screen.getByText("notes.txt"));
    // Non-media, non-text file does nothing on activate.
    await userEvent.click(screen.getByText("data.bin"));
    await userEvent.click(screen.getByText("doc.pdf"));
    await userEvent.click(screen.getByText("song.mp3"));
    expect(onOpenDir).toHaveBeenCalledWith("/Media");
    expect(onOpenMedia).toHaveBeenCalledWith(entries[1]);
    expect(onEditText).toHaveBeenCalledWith(entries[3]);
    expect(onOpenMedia).toHaveBeenCalledWith(entries[5]);
    expect(onOpenMedia).toHaveBeenCalledWith(entries[6]);
  });

  it("shows distinct icons for PDF and audio tiles", () => {
    renderGrid();
    expect(screen.getByText("📕")).toBeInTheDocument();
    expect(screen.getByText("🎵")).toBeInTheDocument();
  });

  it("renders a download link, a rename button and a delete button for files", async () => {
    const onDelete = vi.fn();
    const onRename = vi.fn();
    renderGrid({ onDelete, onRename });
    const download = screen.getByLabelText("Download pic.jpg");
    expect(download).toHaveAttribute("href", "/pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    expect(onRename).toHaveBeenCalledWith(entries[1]);
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    expect(onDelete).toHaveBeenCalledWith(entries[1]);
  });

  it("toggles selection and marks selected tiles", async () => {
    const onToggleSelect = vi.fn();
    renderGrid({ selected: new Set(["/pic.jpg"]), onToggleSelect });
    // A selected entry reports checked and carries the highlight class.
    const picBox = screen.getByLabelText<HTMLInputElement>("Select pic.jpg");
    expect(picBox.checked).toBe(true);
    expect(picBox.closest(".tile")).toHaveClass("tile-selected");
    // Clicking another tile's checkbox reports it back to the parent.
    await userEvent.click(screen.getByLabelText("Select Media"));
    expect(onToggleSelect).toHaveBeenCalledWith(entries[0], false);
  });

  it("reports shift-click so the caller can range-select", () => {
    const onToggleSelect = vi.fn();
    renderGrid({ onToggleSelect });
    fireEvent.click(screen.getByLabelText("Select clip.mp4"), {
      shiftKey: true,
    });
    expect(onToggleSelect).toHaveBeenCalledWith(entries[2], true);
  });


  it("falls back to an icon when a thumbnail fails to load", () => {
    renderGrid();
    // Image thumbnail breaks -> picture fallback glyph.
    fireEvent.error(screen.getByAltText("pic.jpg"));
    expect(screen.getByText("🖼")).toBeInTheDocument();
    // Video thumbnail breaks -> film fallback glyph.
    fireEvent.error(screen.getByAltText("clip.mp4"));
    expect(screen.getByText("🎞")).toBeInTheDocument();
  });
});
