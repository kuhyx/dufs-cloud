import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { createGalleryDialogs } from "../stores/gallery-dialogs.ts";
import type { Mutations } from "../stores/mutations.ts";
import { entry, makeClient } from "../test/client-fixtures.ts";
import { stubDialog } from "../test/dialog-stub.ts";
import { GalleryDialogs } from "./gallery-dialogs.ts";

beforeAll(stubDialog);
afterEach(() => {
  document.body.replaceChildren();
});

function mutations(): Mutations {
  return {
    moveInto: vi.fn(),
    confirmDelete: vi.fn(),
    renameSelected: vi.fn(),
    createFolder: vi.fn(),
    moveSelected: vi.fn(),
    deleteSelected: vi.fn(),
  };
}

function mount() {
  const dialogs = createGalleryDialogs();
  const muts = mutations();
  const client = makeClient();
  const el = new GalleryDialogs();
  el.client = client;
  el.path = "/Media";
  el.selectedCount = 2;
  el.mutations = muts;
  el.dialogs = dialogs;
  const outside = vi.fn();
  for (const type of ["confirm", "cancel", "close", "pick"]) {
    document.body.addEventListener(type, outside);
  }
  const onReload = vi.fn();
  el.addEventListener("reload", onReload);
  document.body.append(el);
  return { el, dialogs, muts, client, outside, onReload };
}

describe("gallery-dialogs", () => {
  it("renders nothing while every dialog is closed", () => {
    const { el } = mount();
    expect(el.children).toHaveLength(0);
    expect(el.selectedCount).toBe(2);
  });

  it("opens the editor and reloads on close", async () => {
    const { el, dialogs, client, onReload, outside } = mount();
    const file = entry("notes.txt", "file");
    dialogs.setEditEntry(file);
    expect(await screen.findByDisplayValue("hello world")).toBeInTheDocument();
    dialogs.setShowMove(false);
    el.selectedCount = 3;
    expect(client.readText).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialogs.getState().editEntry).toBeNull();
    expect(onReload).toHaveBeenCalledOnce();
    expect(outside).not.toHaveBeenCalled();
    expect(el.querySelector("text-editor")).toBeNull();
  });

  it("confirms and cancels a single delete", async () => {
    const { dialogs, muts } = mount();
    const file = entry("pic.jpg", "file");
    dialogs.setDeleteEntry(file);
    expect(screen.getByRole("dialog", { name: 'Delete "pic.jpg"? This cannot be undone.' }))
      .toHaveTextContent("🗑pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(muts.confirmDelete).toHaveBeenCalledWith(file);
    expect(dialogs.getState().deleteEntry).toBeNull();
    dialogs.setDeleteEntry(file);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dialogs.getState().deleteEntry).toBeNull();
    expect(muts.confirmDelete).toHaveBeenCalledOnce();
  });

  it("confirms and cancels deleting the selection, tracking the count", async () => {
    const { el, dialogs, muts } = mount();
    dialogs.openDeleteSelected();
    expect(screen.getByRole("dialog", { name: "Delete 2 item(s)? This cannot be undone." }))
      .toHaveTextContent("🗑2");
    el.selectedCount = 4;
    expect(screen.getByRole("dialog", { name: "Delete 4 item(s)? This cannot be undone." }))
      .toHaveTextContent("🗑4");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(muts.deleteSelected).toHaveBeenCalledOnce();
    expect(dialogs.getState().showDeleteSelected).toBe(false);
    dialogs.openDeleteSelected();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dialogs.getState().showDeleteSelected).toBe(false);
  });

  it("drives the folder picker by its props and pick/cancel events", () => {
    const { el, dialogs, muts, client } = mount();
    dialogs.openMove();
    const picker = el.querySelector("folder-picker") as unknown as {
      client: unknown;
      initialPath: string;
      count: number;
    } & HTMLElement;
    expect(picker.client).toBe(client);
    expect(picker.initialPath).toBe("/Media");
    expect(picker.count).toBe(2);
    el.selectedCount = 5;
    expect(picker.count).toBe(5);
    picker.dispatchEvent(new CustomEvent("pick", { detail: "/Dest", bubbles: true }));
    expect(muts.moveSelected).toHaveBeenCalledWith("/Dest");
    expect(dialogs.getState().showMove).toBe(false);
    dialogs.openMove();
    el.querySelector("folder-picker")?.dispatchEvent(new CustomEvent("cancel", { bubbles: true }));
    expect(dialogs.getState().showMove).toBe(false);
    expect(el.querySelector("folder-picker")).toBeNull();
  });

  it("stops listening when removed and resubscribes to a new store", () => {
    const { el, dialogs } = mount();
    el.remove();
    dialogs.openMove();
    expect(el.querySelector("folder-picker")).toBeNull();
    const next = createGalleryDialogs();
    el.dialogs = next;
    expect(el.dialogs).toBe(next);
    document.body.append(el);
    next.openMove();
    expect(el.querySelector("folder-picker")).not.toBeNull();
    el.dialogs = null;
    expect(el.children).toHaveLength(1);
  });
});
