import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import { makeClient } from "../test/gallery-fixtures.ts";

beforeEach(() => {
  window.location.hash = "";
});

describe("Gallery bulk", () => {
  it("selects items and moves them into a chosen folder", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    // Folder picker opens listing the current dir; pick it as destination.
    await userEvent.click(
      await screen.findByRole("button", { name: "Move here" }),
    );
    await waitFor(() => {
      expect(client.move).toHaveBeenCalledWith("/pic.jpg", "/");
      expect(client.move).toHaveBeenCalledWith("/clip.mp4", "/");
    });
    // Selection clears after a successful move.
    await waitFor(() => {
      expect(screen.queryByText("2 selected")).toBeNull();
    });
  });

  it("selects items and deletes them after confirming", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete 2 item(s)?");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => {
      expect(client.remove).toHaveBeenCalledWith("/pic.jpg");
      expect(client.remove).toHaveBeenCalledWith("/clip.mp4");
    });
    // Selection clears after a successful bulk delete.
    await waitFor(() => {
      expect(screen.queryByText("2 selected")).toBeNull();
    });
  });

  it("cancelling the bulk-delete confirm does nothing", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(client.remove).not.toHaveBeenCalled();
  });

  it("reports how many items failed to delete in a bulk delete", async () => {
    const client = makeClient({
      remove: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("nope")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByText("1 item(s) could not be deleted"),
      ).toBeInTheDocument();
    });
  });

  it("surfaces a move error", async () => {
    const client = makeClient({
      move: vi.fn(() => Promise.reject(new Error("moveerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Move here" }),
    );
    expect(await screen.findByText(/moveerr/)).toBeInTheDocument();
  });

  it("cancels the move picker", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );
    expect(client.move).not.toHaveBeenCalled();
  });

  it("stringifies a non-Error move rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      move: vi.fn(() => Promise.reject("plain-move")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Move here" }),
    );
    expect(await screen.findByText("plain-move")).toBeInTheDocument();
  });
});
