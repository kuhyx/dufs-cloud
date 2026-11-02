import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
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

describe("Gallery upload", () => {
  it("uploads picked files", async () => {
    const client = makeClient();
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(input).not.toBeNull();
    const file = new File(["x"], "up.png", { type: "image/png" });
    if (input) fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(client.upload).toHaveBeenCalled();
    });
  });

  it("names a failed upload without aborting the rest of the batch", async () => {
    const client = makeClient({
      upload: vi.fn((_dir: string, file: File) =>
        file.name === "bad.png"
          ? Promise.reject(new Error("uperr"))
          : Promise.resolve(),
      ),
    });
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (input) {
      fireEvent.change(input, {
        target: {
          files: [
            new File(["x"], "a.png"),
            new File(["x"], "bad.png"),
            new File(["x"], "c.png"),
          ],
        },
      });
    }
    expect(
      await screen.findByText("1 of 3 failed: bad.png"),
    ).toBeInTheDocument();
    expect(client.upload).toHaveBeenCalledTimes(3);
  });

  it("shows per-file progress with a Cancel that aborts the batch", async () => {
    // The first upload only resolves when the test says so, and it reports
    // progress through the hook the gallery passes in.
    let hooks: { onProgress?: (n: number) => void; signal?: AbortSignal } = {};
    let finish: (() => void) | null = null;
    const client = makeClient({
      upload: vi.fn(
        (_dir: string, _file: File, opts?: typeof hooks) =>
          new Promise<void>((resolve, reject) => {
            hooks = opts ?? {};
            finish = resolve;
            opts?.signal?.addEventListener("abort", () => {
              reject(new DOMException("cancelled", "AbortError"));
            });
          }),
      ),
    });
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    const big = new File([new Uint8Array(200)], "big.bin");
    if (input) {
      fireEvent.change(input, {
        target: { files: [big, new File(["x"], "never.png")] },
      });
    }
    expect(await screen.findByText("Uploading 1/2 · big.bin")).toBeInTheDocument();
    expect(screen.getByText("0 % · 0 B / 200 B")).toBeInTheDocument();
    act(() => {
      hooks.onProgress?.(50);
    });
    expect(screen.getByText("25 % · 50 B / 200 B")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0.25");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Cancelled after 0 of 2")).toBeInTheDocument();
    // The banner is gone, the second file never started, and the truncated
    // first file was removed from the server.
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(client.upload).toHaveBeenCalledTimes(1);
    expect(client.remove).toHaveBeenCalledWith("/big.bin");
    expect(finish).not.toBeNull();
  });

  it("still reads as cancelled when the partial cannot be removed", async () => {
    const client = makeClient({
      upload: vi.fn(
        (_dir: string, _file: File, opts?: { signal?: AbortSignal }) =>
          new Promise<void>((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () => {
              reject(new DOMException("cancelled", "AbortError"));
            });
          }),
      ),
      remove: vi.fn(() => Promise.reject(new Error("403"))),
    });
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (input) {
      fireEvent.change(input, { target: { files: [new File(["x"], "a.bin")] } });
    }
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Cancelled after 0 of 1")).toBeInTheDocument();
  });

  it("clears the busy message once a clean batch finishes", async () => {
    const client = makeClient();
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (input) {
      fireEvent.change(input, { target: { files: [new File(["x"], "a.bin")] } });
    }
    await waitFor(() => {
      expect(client.upload).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("progressbar")).toBeNull();
    });
    expect(screen.queryByText(/failed/)).toBeNull();
  });

  it("opens the file picker from the Upload button", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Should not throw; exercises the hidden-input click path.
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  it("ignores an upload with no files selected", async () => {
    const client = makeClient();
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (input) fireEvent.change(input, { target: { files: null } });
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("counts a non-Error upload rejection as a failed file", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      upload: vi.fn(() => Promise.reject("plain-up")),
    });
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (input) {
      fireEvent.change(input, {
        target: { files: [new File(["x"], "u.png")] },
      });
    }
    expect(await screen.findByText("1 of 1 failed: u.png")).toBeInTheDocument();
  });
});
