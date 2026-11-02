import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import type { DirEntry } from "../api/types.ts";
import { entry, fileAt, makeClient } from "../test/gallery-fixtures.ts";

beforeEach(() => {
  window.location.hash = "";
});

describe("Gallery search", () => {
  it("searches the whole cloud when filtering and groups by folder", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Fuzzy subsequence "pcj" matches pic.jpg — which exists at root AND /Media.
    await userEvent.type(screen.getByLabelText("Filter by name"), "pcj");
    await waitFor(() => {
      expect(screen.getAllByText("pic.jpg")).toHaveLength(2);
    });
    // Non-matching files are gone, and results are grouped under folder headers.
    expect(screen.queryByText("clip.mp4")).toBeNull();
    expect(screen.getByRole("button", { name: "📁 /Media" })).toBeInTheDocument();
  });

  it("excludes folders from global results and collapses a folder group", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "pcj");
    // Files only — the Media folder is never a global result.
    await waitFor(() => {
      expect(screen.getAllByText("pic.jpg")).toHaveLength(2);
    });
    expect(screen.queryByText("Media")).toBeNull();
    // Collapsing the /Media group hides its file, leaving the root match.
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse /Media" }),
    );
    await waitFor(() => {
      expect(screen.getAllByText("pic.jpg")).toHaveLength(1);
    });
    // Expanding brings it back.
    await userEvent.click(
      screen.getByRole("button", { name: "Expand /Media" }),
    );
    await waitFor(() => {
      expect(screen.getAllByText("pic.jpg")).toHaveLength(2);
    });
  });

  it("shows folders (not files) when filtering by the Folders type", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Activate the index, then switch the type filter to Folders.
    await userEvent.click(screen.getByLabelText("Filter by name"));
    fireEvent.change(screen.getByLabelText("Filter by type"), {
      target: { value: "folder" },
    });
    // The Media folder is a result; files are excluded from a folder search.
    expect(await screen.findByText("Media")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("pic.jpg")).toBeNull();
    });
  });

  it("shows an indexing hint, then a global no-matches message", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "zzz");
    // Once indexed, a query matching nothing on the cloud says so distinctly.
    expect(
      await screen.findByText("Nothing on the cloud matches your filters."),
    ).toBeInTheDocument();
  });

  it("keeps browsing local while the index is still building", async () => {
    let resolveRoot!: (v: DirEntry[]) => void;
    const gate = new Promise<DirEntry[]>((r) => {
      resolveRoot = r;
    });
    let calls = 0;
    const client = makeClient({
      list: vi.fn((p: string) => {
        calls += 1;
        // First call (folder listing) resolves; the index walk's root list hangs.
        if (calls === 1) {
          return Promise.resolve([entry("pic.jpg", "file")]);
        }
        return p === "/" ? gate : Promise.resolve([]);
      }),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "p");
    expect(
      await screen.findByText("Indexing the whole cloud…"),
    ).toBeInTheDocument();
    resolveRoot([fileAt("/pic.jpg")]);
    await waitFor(() => {
      expect(screen.queryByText("Indexing the whole cloud…")).toBeNull();
    });
  });

  it("surfaces a cloud-index failure", async () => {
    let calls = 0;
    const client = makeClient({
      list: vi.fn(() => {
        calls += 1;
        if (calls === 1) return Promise.resolve([entry("pic.jpg", "file")]);
        return Promise.reject(new Error("indexerr"));
      }),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "p");
    expect(
      await screen.findByText(/Could not index the cloud: indexerr/),
    ).toBeInTheDocument();
  });

  it("navigates into a folder from a global result header, clearing the filter", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "pcj");
    const header = await screen.findByRole("button", { name: "📁 /Media" });
    await userEvent.click(header);
    await waitFor(() => {
      expect(window.location.hash).toBe("#/Media");
    });
    // Filter cleared → the query box is empty and browsing is local again.
    expect(
      screen.getByLabelText<HTMLInputElement>("Filter by name").value,
    ).toBe("");
  });

  it("downloads a cross-folder global selection relative to the cloud root", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "pcj");
    // Two pic.jpg results (root + /Media); select the one under /Media.
    // The query is debounced, so wait for the filter to reach the index.
    await waitFor(
      () => {
        expect(screen.getAllByLabelText("Select pic.jpg")).toHaveLength(2);
      },
      { timeout: 3000 },
    );
    const [, underMedia] = screen.getAllByLabelText("Select pic.jpg");
    if (underMedia === undefined) throw new Error("expected two checkboxes");
    await userEvent.click(underMedia);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });
});
