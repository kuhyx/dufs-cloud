import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import { entry, makeClient } from "../test/gallery-fixtures.ts";

beforeEach(() => {
  window.location.hash = "";
});

describe("Gallery download", () => {
  it("downloads selected files as a client-side zip", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByLabelText("Select notes.txt"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(client.downloadBytes).toHaveBeenCalledWith("/pic.jpg", expect.anything());
      expect(client.downloadBytes).toHaveBeenCalledWith("/notes.txt", expect.anything());
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
    // Selection clears once the archive is built.
    await waitFor(() => {
      expect(screen.queryByText(/selected/)).toBeNull();
    });
  });

  it("shows zip progress per file and can be cancelled", async () => {
    let hooks: { onProgress?: (n: number) => void; signal?: AbortSignal } = {};
    const client = makeClient({
      downloadBytes: vi.fn(
        (_p: string, opts?: typeof hooks) =>
          new Promise<Uint8Array>((_resolve, reject) => {
            hooks = opts ?? {};
            opts?.signal?.addEventListener("abort", () => {
              reject(new DOMException("cancelled", "AbortError"));
            });
          }),
      ),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByLabelText("Select notes.txt"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(
      await screen.findByText("Downloading 1/2 · notes.txt"),
    ).toBeInTheDocument();
    act(() => {
      hooks.onProgress?.(5);
    });
    expect(screen.getByText("50 % · 5 B / 10 B")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Zip cancelled")).toBeInTheDocument();
    expect(client.downloadBytes).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("recursively zips a selected folder client-side", async () => {
    // Path-aware listing so the recursive gather terminates: /Media holds one
    // file (the root listing is the default 4-entry set).
    const client = makeClient({
      list: vi.fn((p: string) =>
        p === "/Media"
          ? Promise.resolve([
              {
                name: "forest.jpg",
                path: "/Media/forest.jpg",
                kind: "file" as const,
                size: 5,
                mtimeMs: 0,
              },
            ])
          : Promise.resolve([
              entry("Media", "dir"),
              entry("pic.jpg", "file"),
            ]),
      ),
    });
    render(<Gallery client={client} />);
    await screen.findByText("Media");
    await userEvent.click(screen.getByLabelText("Select Media"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    // The folder is walked and its file bytes fetched for the client-side zip.
    await waitFor(() => {
      expect(client.downloadBytes).toHaveBeenCalledWith("/Media/forest.jpg", expect.anything());
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByText(/selected/)).toBeNull();
    });
  });

  it("surfaces a download build error", async () => {
    const client = makeClient({
      downloadBytes: vi.fn(() => Promise.reject(new Error("dlerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText(/dlerr/)).toBeInTheDocument();
  });

  it("names the download zip after a non-root folder", async () => {
    window.location.hash = "#/Media";
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(client.downloadBytes).toHaveBeenCalledWith("/Media/pic.jpg", expect.anything());
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it("stringifies a non-Error download rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      downloadBytes: vi.fn(() => Promise.reject("plain-dl")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText("plain-dl")).toBeInTheDocument();
  });
});
