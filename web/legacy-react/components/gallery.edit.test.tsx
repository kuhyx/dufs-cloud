import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import { makeClient } from "../test/gallery-fixtures.ts";

beforeEach(() => {
  window.location.hash = "";
});

describe("Gallery edit", () => {
  it("edits a text file and saves it", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await userEvent.click(await screen.findByText("notes.txt"));
    const area = await screen.findByDisplayValue("hello world");
    await userEvent.clear(area);
    await userEvent.type(area, "new text");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(client.writeText).toHaveBeenCalledWith("/notes.txt", "new text");
    });
  });

  it("deletes a file after confirming", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(client.remove).toHaveBeenCalledWith("/pic.jpg");
    });
  });

  it("surfaces a delete error", async () => {
    const client = makeClient({
      remove: vi.fn(() => Promise.reject(new Error("delerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/delerr/)).toBeInTheDocument();
  });

  it("cancels a delete", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(client.remove).not.toHaveBeenCalled();
  });

  it("renames a file, pre-filled with its current name", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    const input = screen.getByLabelText('Rename "pic.jpg"');
    expect(input).toHaveValue("pic.jpg");
    await userEvent.clear(input);
    await userEvent.type(input, "renamed.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => {
      expect(client.rename).toHaveBeenCalledWith("/pic.jpg", "renamed.jpg");
    });
  });

  it("cancels a rename", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(client.rename).not.toHaveBeenCalled();
  });

  it("surfaces a rename error", async () => {
    const client = makeClient({
      rename: vi.fn(() => Promise.reject(new Error("renameerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText(/renameerr/)).toBeInTheDocument();
  });

  it("stringifies a non-Error rename rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      rename: vi.fn(() => Promise.reject("plain-rename")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText("plain-rename")).toBeInTheDocument();
  });

  it("stringifies a non-Error delete rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      remove: vi.fn(() => Promise.reject("plain-del")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("plain-del")).toBeInTheDocument();
  });

  it("closes the text editor and reloads", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await userEvent.click(await screen.findByText("notes.txt"));
    await screen.findByDisplayValue("hello world");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue("hello world")).toBeNull();
    });
    // reload() re-invokes list (initial + after close).
    expect((client.list as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
  });

  it("creates a new folder", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.type(screen.getByLabelText("New folder name"), "Trips");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(client.createDir).toHaveBeenCalledWith("/Trips");
    });
  });

  it("surfaces a new-folder error", async () => {
    const client = makeClient({
      createDir: vi.fn(() => Promise.reject(new Error("mkcolerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.type(screen.getByLabelText("New folder name"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(/mkcolerr/)).toBeInTheDocument();
  });

  it("cancels the new-folder dialog", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New folder name")).toBeNull();
    expect(client.createDir).not.toHaveBeenCalled();
  });

  it("stringifies a non-Error new-folder rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      createDir: vi.fn(() => Promise.reject("plain-mkcol")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.type(screen.getByLabelText("New folder name"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("plain-mkcol")).toBeInTheDocument();
  });
});
