import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { screen, waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { makeClient } from "../test/client-fixtures.ts";
import { stubDialog } from "../test/dialog-stub.ts";
import { TextEditor } from "./text-editor.ts";

const entry: DirEntry = { name: "n.txt", path: "/n.txt", kind: "file", size: 3, mtimeMs: 0 };

beforeAll(stubDialog);
afterEach(() => {
  document.body.replaceChildren();
});

function client(over: Partial<DufsClient> = {}): DufsClient {
  return makeClient({ readText: vi.fn(() => Promise.resolve("body")), ...over });
}

function mount(c: DufsClient): TextEditor {
  const el = new TextEditor();
  el.client = c;
  el.entry = entry;
  document.body.append(el);
  return el;
}

describe("text-editor", () => {
  it("loads, edits and saves", async () => {
    const c = client();
    const el = mount(c);
    expect(el.client).toBe(c);
    expect(el.entry).toBe(entry);
    expect(screen.getByText("loading")).toHaveClass("editor-status");
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    const area = await screen.findByDisplayValue("body");
    expect(area).toHaveClass("editor-area");
    expect(area).toHaveAttribute("spellcheck", "false");
    expect(screen.getByText("n.txt").parentElement).toHaveClass("editor-head");
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(el.querySelector(".dialog")).toHaveClass("editor");
    expect(c.readText).toHaveBeenCalledOnce();
    await userEvent.clear(area);
    await userEvent.type(area, "changed");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(c.writeText).toHaveBeenCalledWith("/n.txt", "changed");
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    mount(client({ readText: vi.fn(() => Promise.reject(new Error("nope"))) }));
    expect(await screen.findByText("nope")).toBeInTheDocument();
  });

  it("shows a save error", async () => {
    mount(client({ writeText: vi.fn(() => Promise.reject(new Error("wfail"))) }));
    await screen.findByDisplayValue("body");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("wfail")).toBeInTheDocument();
  });

  it("stringifies non-Error rejections", async () => {
    mount(
      client({
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        writeText: vi.fn(() => Promise.reject("plain-save-failure")),
      }),
    );
    await screen.findByDisplayValue("body");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("plain-save-failure")).toBeInTheDocument();
    document.body.replaceChildren();
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    mount(client({ readText: vi.fn(() => Promise.reject("plain-load-failure")) }));
    expect(await screen.findByText("plain-load-failure")).toBeInTheDocument();
  });

  it("closes via the button and Escape", async () => {
    const el = mount(client());
    const onClose = vi.fn();
    el.addEventListener("close", onClose);
    await screen.findByDisplayValue("body");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("dialog"));
    screen.getByRole("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    el.remove();
    expect(screen.queryByRole("dialog")).toBeNull();
    document.body.append(el);
    expect(el.querySelectorAll("dialog")).toHaveLength(1);
    expect(el.client?.readText).toHaveBeenCalledTimes(2);
  });

  it("waits for client and entry, and reloads when the entry changes", async () => {
    const c = client();
    const el = new TextEditor();
    document.body.append(el);
    el.client = c;
    expect(c.readText).not.toHaveBeenCalled();
    el.entry = { ...entry, name: "m.md", path: "/m.md" };
    await screen.findByDisplayValue("body");
    expect(c.readText).toHaveBeenCalledWith("/m.md");
    el.entry = null;
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    el.client = null;
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(c.writeText).not.toHaveBeenCalled();
  });

  it("ignores a load that settles after removal", async () => {
    let settle: (v: string) => void = () => undefined;
    let fail: (e: unknown) => void = () => undefined;
    const ok = new Promise<string>((resolve) => {
      settle = resolve;
    });
    const bad = new Promise<string>((_, reject) => {
      fail = reject;
    });
    const first = mount(client({ readText: vi.fn(() => ok) }));
    const second = mount(client({ readText: vi.fn(() => bad) }));
    first.remove();
    second.remove();
    settle("late");
    fail(new Error("late"));
    await ok;
    await bad.catch(() => undefined);
    expect(first.querySelector("textarea")?.value).toBe("");
    expect(second.querySelector(".editor-status")?.textContent).toBe("loading");
  });
});
