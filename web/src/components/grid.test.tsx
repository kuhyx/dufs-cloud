import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Grid } from "./grid.tsx";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

function entry(name: string, kind: "dir" | "file"): DirEntry {
  return { name, path: `/${name}`, kind, size: 42, mtimeMs: 0 };
}

function makeClient(): DufsClient {
  return {
    list: vi.fn(),
    fileUrl: (p: string) => p,
    thumbUrl: (p: string) => `/.thumbs${p}.jpg`,
    upload: vi.fn(),
    remove: vi.fn(),
    readText: vi.fn(),
    writeText: vi.fn(),
    zipUrl: (p: string) => `${p}?zip`,
    createDir: vi.fn(),
    move: vi.fn(),
    rename: vi.fn(),
    fetchMeta: vi.fn(() => Promise.resolve({})),
    downloadBytes: vi.fn(() => Promise.resolve(new Uint8Array())),
  };
}

const entries: DirEntry[] = [
  entry("Media", "dir"),
  entry("pic.jpg", "file"),
  entry("clip.mp4", "file"),
  entry("notes.txt", "file"),
  entry("data.bin", "file"),
  entry("doc.pdf", "file"),
  entry("song.mp3", "file"),
];

function renderGrid(over: Partial<Parameters<typeof Grid>[0]> = {}) {
  const props = {
    client: makeClient(),
    entries,
    selected: new Set<string>(),
    onToggleSelect: vi.fn(),
    onOpenDir: vi.fn(),
    onOpenMedia: vi.fn(),
    onEditText: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    ...over,
  };
  render(<Grid {...props} />);
  return props;
}

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
    expect(onToggleSelect).toHaveBeenCalledWith(entries[0]);
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
