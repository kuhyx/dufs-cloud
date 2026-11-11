import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { deferred, flush } from "../test/store-helpers.ts";
import { entry, makeClient } from "../test/client-fixtures.ts";
import { fire, mountGallery } from "../test/gallery-harness.ts";
import { DEFAULT_FILTER } from "../lib/filter-sort.ts";
import type { TransferOptions } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import type { CloudGallery } from "./gallery.ts";

function dragEvent(type: string, types: string[], fileList: File[] = []): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", {
    value: { types, files: fileList, dropEffect: "none", getData: () => "" },
  });
  return ev;
}

describe("cloud-gallery flows", () => {
  it("mounts once a client arrives and tears down on disconnect", async () => {
    window.location.hash = "";
    const el = document.createElement("cloud-gallery") as CloudGallery;
    document.body.replaceChildren(el);
    expect(el.client).toBeNull();
    expect(el.childElementCount).toBe(0);
    const client = makeClient();
    el.client = client;
    expect(el.querySelector(".gallery")).not.toBeNull();
    el.client = client;
    expect(el.querySelectorAll(".gallery")).toHaveLength(1);
    el.remove();
    expect(el.childElementCount).toBe(0);
    document.body.append(el);
    await flush();
    expect(el.querySelector(".gallery main")).not.toBeNull();
    fire(el.querySelector("gallery-topbar") ?? el, "upload-picked", [new File(["x"], "r.txt")]);
    await flush();
    expect(client.upload).toHaveBeenCalledTimes(1);
  });

  it("uploads picked files behind a cancellable transfer banner", async () => {
    const gate = deferred<undefined>();
    let progress: TransferOptions["onProgress"];
    const g = await mountGallery({
      upload: vi.fn((_dir: string, _file: File, opts?: TransferOptions) => {
        progress = opts?.onProgress;
        return gate.promise;
      }),
    });
    fire(g.kid("gallery-topbar") as HTMLElement, "upload-picked", [new File(["ab"], "a.txt")]);
    const banner = g.kid("transfer-banner");
    expect(banner?.progress).toMatchObject({ kind: "upload", name: "a.txt", done: 0 });
    progress?.(1);
    expect(g.kid("transfer-banner")).toBe(banner);
    expect(banner?.progress).toMatchObject({ done: 1 });
    fire(banner as HTMLElement, "cancel");
    gate.reject(new DOMException("aborted", "AbortError"));
    await flush();
    expect(g.kid("transfer-banner")).toBeNull();
    expect((g.kid("gallery-topbar")?.busy as { spoken: string } | null)?.spoken).toBe("Cancelled after 0 of 1");
  });

  it("accepts OS file drops on the content area", async () => {
    const g = await mountGallery();
    g.main.dispatchEvent(dragEvent("dragover", ["Files"]));
    expect(g.main).toHaveClass("content", "content-drop");
    g.main.dispatchEvent(dragEvent("dragleave", ["Files"]));
    expect(g.main).not.toHaveClass("content-drop");
    g.main.dispatchEvent(dragEvent("drop", ["Files"], [new File(["x"], "d.txt")]));
    await flush();
    expect(g.client.upload).toHaveBeenCalledWith("/", expect.any(File), expect.anything());
  });

  it("moves and uploads into folder tiles", async () => {
    const g = await mountGallery();
    const tile = (): HTMLElement => screen.getByLabelText("Select Media").closest("li") as HTMLElement;
    fire(tile(), "move-into", { destDir: "/Media", paths: ["/pic.jpg"] });
    await flush();
    expect(g.client.move).toHaveBeenCalledWith("/pic.jpg", "/Media");
    fire(tile(), "upload-into", { destDir: "/Media", files: [new File(["x"], "u.txt")] });
    await flush();
    expect(g.client.upload).toHaveBeenCalledWith("/Media", expect.any(File), expect.anything());
  });

  it("groups global results, collapses them and opens their folders", async () => {
    const g = await mountGallery();
    const bar = g.kid("filter-bar") as HTMLElement;
    fire(bar, "activate");
    fire(bar, "filter", { ...DEFAULT_FILTER, query: "pic" });
    await flush();
    const groups = g.kid("result-groups") as HTMLElement & Record<string, unknown>;
    expect(groups.groups).toHaveLength(2);
    await userEvent.click(screen.getByLabelText("Collapse /Media"));
    expect(screen.getByLabelText("Expand /Media")).toBeInTheDocument();
    await userEvent.click(screen.getByText("📁 /Media"));
    await flush();
    expect(window.location.hash).toBe("#/Media");
  });

  it("flags a cancelled index as partial and reports index errors", async () => {
    const gate = deferred<readonly DirEntry[]>();
    const g = await mountGallery({
      list: vi.fn((p: string) =>
        p === "/" ? Promise.resolve([entry("Media", "dir")]) : gate.promise.then((l) => [...l]),
      ),
    });
    const bar = g.kid("filter-bar") as HTMLElement;
    fire(bar, "filter", { ...DEFAULT_FILTER, query: "x" });
    fire(bar, "activate");
    await flush();
    fire(bar, "cancel-index");
    gate.resolve([]);
    await flush();
    expect(screen.getByLabelText("Partial index")).toHaveTextContent("⚠");

    let calls = 0;
    const bad = await mountGallery({
      list: vi.fn(() => (++calls === 1 ? Promise.resolve([]) : Promise.reject(new Error("down")))),
    });
    fire(bad.kid("filter-bar") as HTMLElement, "filter", { ...DEFAULT_FILTER, query: "x" });
    fire(bad.kid("filter-bar") as HTMLElement, "activate");
    await flush();
    expect(screen.getByLabelText("Could not index the cloud: down")).toHaveClass("error");
  });

  it("keeps open prompts across unrelated re-renders", async () => {
    const g = await mountGallery();
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    const prompts = [...g.el.querySelectorAll("prompt-dialog")];
    expect(prompts).toHaveLength(2);
    await userEvent.click(screen.getByLabelText("Select notes.txt"));
    expect([...g.el.querySelectorAll("prompt-dialog")]).toEqual(prompts);
  });
});
