import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

function entry(path: string, kind: "dir" | "file"): DirEntry {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    kind,
    size: 10,
    mtimeMs: 0,
  };
}

beforeEach(() => {
  window.location.hash = "";
});

describe("Gallery whole-cloud index feedback", () => {
  it("cancelling the walk keeps the partial results and flags them", async () => {
    let releaseSub!: (v: DirEntry[]) => void;
    const sub = new Promise<DirEntry[]>((r) => {
      releaseSub = r;
    });
    const root = [entry("/Sub", "dir"), entry("/pic.jpg", "file")];
    const client = {
      list: vi.fn((p: string) => (p === "/Sub" ? sub : Promise.resolve(root))),
      fileUrl: (p: string) => p,
      thumbUrl: (p: string) => p,
      zipUrl: (p: string) => p,
      fetchMeta: vi.fn(() => Promise.resolve({})),
      fetchSubtitleManifest: vi.fn(() => Promise.resolve(null)),
    } as unknown as DufsClient;
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");

    await userEvent.type(screen.getByLabelText("Filter by name"), "pic");
    // The walk is stuck inside /Sub: root listed (1 folder), 2 entries found.
    const cancel = await screen.findByRole("button", { name: "Cancel indexing" });
    await waitFor(() => {
      expect(screen.getByLabelText("Entries found")).toHaveTextContent("2");
    });
    fireEvent.click(cancel);
    releaseSub([]);

    await screen.findByLabelText("Partial index");
    expect(screen.queryByRole("button", { name: "Cancel indexing" })).toBeNull();
    expect(screen.getAllByText("pic.jpg").length).toBeGreaterThan(0);
  });
});
