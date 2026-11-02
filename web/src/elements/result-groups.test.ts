import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import type { FolderGroup } from "../lib/cloud-stats.ts";
import { fileAt, makeClient } from "../test/client-fixtures.ts";
import type { CloudGrid } from "./grid.ts";
import { ResultGroups } from "./result-groups.ts";

const groupA: FolderGroup = { folder: "/A", entries: [fileAt("/A/a.txt"), fileAt("/A/b.txt")] };
const groupB: FolderGroup = { folder: "/B", entries: [fileAt("/B/c.txt")] };

function mount(collapsed: string[] = []): ResultGroups {
  const el = document.createElement("result-groups") as ResultGroups;
  el.client = makeClient();
  el.groups = [groupA, groupB];
  el.collapsed = new Set(collapsed);
  el.selected = new Set(["/A/a.txt"]);
  document.body.append(el);
  return el;
}

const sections = (el: Element): HTMLElement[] => [...el.querySelectorAll("section")];

afterEach(() => {
  document.body.replaceChildren();
});

describe("result-groups", () => {
  it("renders one section per folder with a toggle, path button and count", () => {
    const el = mount(["/B"]);
    const [a, b] = sections(el) as [HTMLElement, HTMLElement];
    expect(a).toHaveClass("result-group");
    const toggleA = within(a).getByLabelText("Collapse /A");
    expect(toggleA).toHaveAttribute("aria-expanded", "true");
    expect(toggleA).toHaveTextContent("▾");
    expect(within(a).getByText("📁 /A")).toHaveClass("group-path");
    expect(within(a).getByText("2")).toHaveClass("group-count", "muted");
    expect(a.querySelector("cloud-grid")).not.toBeNull();
    expect(screen.getByLabelText("Select a.txt")).toBeChecked();
    const toggleB = within(b).getByLabelText("Expand /B");
    expect(toggleB).toHaveAttribute("aria-expanded", "false");
    expect(toggleB).toHaveTextContent("▸");
    expect(b.querySelector("cloud-grid")).toBeNull();
    expect(el.groups).toHaveLength(2);
    expect(el.collapsed.has("/B")).toBe(true);
    expect(el.selected.has("/A/a.txt")).toBe(true);
    expect(el.client).not.toBeNull();
  });

  it("fires toggle-collapsed and open-dir", async () => {
    const user = userEvent.setup();
    const el = mount();
    const toggled = vi.fn();
    const opened = vi.fn();
    el.addEventListener("toggle-collapsed", (e) => {
      toggled((e as CustomEvent).detail);
    });
    el.addEventListener("open-dir", (e) => {
      opened((e as CustomEvent).detail);
    });
    await user.click(screen.getByLabelText("Collapse /B"));
    await user.click(screen.getByText("📁 /A"));
    expect(toggled).toHaveBeenCalledWith("/B");
    expect(opened).toHaveBeenCalledWith("/A");
  });

  it("reuses sections, rebuilding only what changed, and passes the selection down", () => {
    const el = mount();
    const [a, b] = sections(el) as [HTMLElement, HTMLElement];
    el.selected = new Set(["/B/c.txt"]);
    expect(sections(el)).toEqual([a, b]);
    const gridB = b.querySelector<CloudGrid>("cloud-grid");
    expect(gridB?.selected.has("/B/c.txt")).toBe(true);
    el.collapsed = new Set(["/A"]);
    const [a2, b2] = sections(el);
    expect(a2).not.toBe(a);
    expect(b2).toBe(b);
    el.groups = [groupB];
    expect(sections(el)).toEqual([b]);
    el.client = makeClient();
    expect(sections(el)[0]).not.toBe(b);
  });

  it("renders nothing until a client is set", () => {
    const el = document.createElement("result-groups") as ResultGroups;
    el.groups = [groupA];
    expect(sections(el)).toHaveLength(0);
    expect(customElements.get("result-groups")).toBe(ResultGroups);
  });
});
