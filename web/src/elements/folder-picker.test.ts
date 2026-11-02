import { findByText, getByRole, getByText, queryByText } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { makeClient } from "../test/client-fixtures.ts";
import { FolderPicker } from "./folder-picker.ts";

function dir(name: string, parent = ""): DirEntry {
  return { name, path: `${parent}/${name}`, kind: "dir", size: 0, mtimeMs: 0 };
}
function fileEntry(name: string): DirEntry {
  return { name, path: `/${name}`, kind: "file", size: 1, mtimeMs: 0 };
}

function make(list: DufsClient["list"], initialPath = "/Media") {
  const el = new FolderPicker();
  el.client = makeClient({ list: vi.fn(list) });
  el.initialPath = initialPath;
  el.count = 2;
  const picks: string[] = [];
  const cancels: number[] = [];
  el.addEventListener("pick", (e) => picks.push((e as CustomEvent<string>).detail));
  el.addEventListener("cancel", () => cancels.push(1));
  document.body.append(el);
  return { el, picks, cancels };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("folder-picker", () => {
  it("registers and renders the dialog structure", async () => {
    const { el } = make(() => Promise.resolve([]));
    expect(customElements.get("folder-picker")).toBe(FolderPicker);
    const overlay = el.querySelector(".overlay");
    expect(overlay).toHaveAttribute("role", "dialog");
    expect(overlay).toHaveAttribute("aria-modal", "true");
    expect(getByText(el, "Move 2 items to:")).toBeInTheDocument();
    expect(el.querySelector(".picker-path")).toHaveTextContent("/Media");
    await findByText(el, "No subfolders.");
    el.count = 1;
    expect(getByText(el, "Move 1 item to:")).toBeInTheDocument();
    expect(el.count).toBe(1);
    expect(el.initialPath).toBe("/Media");
    expect(el.client).toBeDefined();
  });

  it("shows three skeleton rows, not text, while loading", () => {
    const { el } = make(() => new Promise(() => undefined));
    const rows = el.querySelectorAll("li.skeleton-row");
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toHaveAttribute("aria-hidden", "true");
    expect(queryByText(el, "Loading…")).toBeNull();
  });

  it("lists only folders, drops the skeletons and picks the directory", async () => {
    const { el, picks } = make(() =>
      Promise.resolve([dir("2026", "/Media"), fileEntry("stray.jpg")]),
    );
    expect(await findByText(el, "📁 2026")).toBeInTheDocument();
    expect(queryByText(el, "stray.jpg")).toBeNull();
    expect(el.querySelector(".skeleton-row")).toBeNull();
    await userEvent.click(getByRole(el, "button", { name: "Move here" }));
    expect(picks).toEqual(["/Media"]);
  });

  it("descends into a subfolder and steps back up", async () => {
    const { el, picks } = make((p) =>
      Promise.resolve(p === "/Media" ? [dir("2026", "/Media")] : [dir("07", "/Media/2026")]),
    );
    await userEvent.click(await findByText(el, "📁 2026"));
    expect(await findByText(el, "📁 07")).toBeInTheDocument();
    await userEvent.click(getByRole(el, "button", { name: "Move here" }));
    expect(picks).toEqual(["/Media/2026"]);
    await userEvent.click(getByText(el, "📁 .."));
    expect(await findByText(el, "📁 2026")).toBeInTheDocument();
    expect(el.querySelector(".picker-path")).toHaveTextContent("/Media");
  });

  it("hides the up row at the root", async () => {
    const { el } = make(() => Promise.resolve([dir("Media", "")]), "/");
    await findByText(el, "📁 Media");
    expect(queryByText(el, "📁 ..")).toBeNull();
  });

  it("surfaces a load error (Error and non-Error)", async () => {
    const err = make(() => Promise.reject(new Error("nope")));
    expect(await findByText(err.el, "Could not load: nope")).toHaveClass("error");

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const plain = make(() => Promise.reject("boom-string"));
    expect(await findByText(plain.el, /boom-string/)).toBeInTheDocument();
  });

  it("cancels via the button and the overlay, but not a click inside the dialog", async () => {
    const { el, cancels } = make(() => Promise.resolve([]));
    await findByText(el, "No subfolders.");
    await userEvent.click(getByRole(el, "button", { name: "Cancel" }));
    expect(cancels).toHaveLength(1);
    await userEvent.click(getByText(el, "Move 2 items to:"));
    expect(cancels).toHaveLength(1);
    await userEvent.click(getByRole(el, "dialog"));
    expect(cancels).toHaveLength(2);
  });

  it("ignores a listing that resolves after disconnect", async () => {
    let resolve!: (v: DirEntry[]) => void;
    const pending = new Promise<DirEntry[]>((r) => {
      resolve = r;
    });
    const { el } = make(() => pending);
    el.remove();
    resolve([dir("Late", "/Media")]);
    await pending;
    expect(queryByText(el, "📁 Late")).toBeNull();
  });

  it("lets the newest navigation win over a slower earlier listing", async () => {
    let resolveSlow!: (v: DirEntry[]) => void;
    const slow = new Promise<DirEntry[]>((r) => {
      resolveSlow = r;
    });
    const { el } = make((p) => (p === "/Media" ? slow : Promise.resolve([dir("B", "/Other")])));
    el.initialPath = "/Other";
    await findByText(el, "📁 B");
    resolveSlow([dir("A", "/Media")]);
    await slow;
    expect(queryByText(el, "📁 A")).toBeNull();
    expect(el.querySelector(".picker-path")).toHaveTextContent("/Other");
  });

  it("waits for a client and reloads when it is swapped", async () => {
    const el = new FolderPicker();
    el.initialPath = "/Media";
    document.body.append(el);
    expect(el.querySelectorAll(".skeleton-row")).toHaveLength(3);
    el.client = makeClient({ list: vi.fn(() => Promise.resolve([dir("X", "/Media")])) });
    expect(await findByText(el, "📁 X")).toBeInTheDocument();
  });

  it("keeps the first registration when the module is evaluated again", async () => {
    vi.resetModules();
    await import("./folder-picker.ts");
    expect(customElements.get("folder-picker")).toBe(FolderPicker);
  });
});
