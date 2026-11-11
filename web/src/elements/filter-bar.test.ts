import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, screen } from "@testing-library/dom";
import { DEFAULT_FILTER, DEFAULT_SORT, type FilterState } from "../lib/filter-sort.ts";
import { FilterBar } from "./filter-bar.ts";

type Kid = HTMLElement & Record<string, unknown>;

function mount(props: Partial<Record<string, unknown>> = {}): {
  bar: FilterBar;
  events: { type: string; detail: unknown }[];
} {
  const bar = document.createElement("filter-bar") as FilterBar;
  Object.assign(bar, props);
  const events: { type: string; detail: unknown }[] = [];
  for (const type of ["filter", "sort", "activate", "cancel-index"]) {
    bar.addEventListener(type, (e) => {
      events.push({ type, detail: (e as CustomEvent).detail });
    });
  }
  document.body.append(bar);
  return { bar, events };
}

const kid = (tag: string): Kid | null => document.querySelector<Kid>(tag);
const withFilter = (f: Partial<FilterState>): FilterState => ({ ...DEFAULT_FILTER, ...f });

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("filter-bar", () => {
  it("registers and renders the default controls", () => {
    expect(customElements.get("filter-bar")).toBe(FilterBar);
    mount();
    expect(screen.getByLabelText("Filter by name")).toHaveAttribute("placeholder", "🔍");
    expect(screen.getByRole("option", { name: "Images" })).toHaveTextContent("🖼");
    expect(screen.getByLabelText("Filter by type")).toHaveValue("all");
    expect(screen.getByLabelText("Sort by")).toHaveValue("name");
    expect(screen.getByRole("option", { name: "Sort: Extension" })).toBeInTheDocument();
    expect(kid("extension-picker")).not.toBeNull();
    expect(kid("size-range")).not.toBeNull();
    expect(kid("duration-range")).toBeNull();
    expect(kid("resolution-range")).toBeNull();
    expect(screen.queryByLabelText("Clear filters")).toBeNull();
    expect(screen.queryByRole("status", { name: "Indexing cloud" })).toBeNull();
  });

  it("does not duplicate the bar on reconnect", () => {
    const { bar } = mount();
    bar.remove();
    document.body.append(bar);
    expect(bar.querySelectorAll(".filterbar")).toHaveLength(1);
  });

  it("emits activate when any control gains focus", () => {
    const { events } = mount();
    screen.getByLabelText("Filter by type").focus();
    expect(events.map((e) => e.type)).toEqual(["activate"]);
  });

  it("debounces the query so only the last keystroke is emitted", () => {
    vi.useFakeTimers();
    const { events } = mount();
    const input = screen.getByLabelText("Filter by name");
    fireEvent.input(input, { target: { value: "c" } });
    vi.advanceTimersByTime(100);
    fireEvent.input(input, { target: { value: "cat" } });
    vi.advanceTimersByTime(199);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(events).toEqual([{ type: "filter", detail: withFilter({ query: "cat" }) }]);
  });

  it("follows a query changed by the parent", () => {
    const { bar } = mount();
    const input = screen.getByLabelText<HTMLInputElement>("Filter by name");
    bar.filter = withFilter({ query: "dog" });
    expect(input.value).toBe("dog");
    input.value = "typed";
    bar.filter = withFilter({ query: "dog", type: "image" });
    expect(input.value).toBe("typed");
  });

  it("Clear emits the default filter and drops a pending query", () => {
    vi.useFakeTimers();
    const { events } = mount({ filter: withFilter({ type: "image" }) });
    fireEvent.input(screen.getByLabelText("Filter by name"), { target: { value: "x" } });
    fireEvent.click(screen.getByLabelText("Clear filters"));
    vi.advanceTimersByTime(500);
    expect(events).toEqual([{ type: "filter", detail: DEFAULT_FILTER }]);
  });

  it("disconnecting cancels a pending query", () => {
    vi.useFakeTimers();
    const { bar, events } = mount();
    fireEvent.input(screen.getByLabelText("Filter by name"), { target: { value: "x" } });
    bar.remove();
    vi.advanceTimersByTime(500);
    expect(events).toEqual([]);
  });

  it("emits the type change", () => {
    const { events } = mount();
    fireEvent.change(screen.getByLabelText("Filter by type"), { target: { value: "video" } });
    expect(events).toEqual([{ type: "filter", detail: withFilter({ type: "video" }) }]);
  });

  it("shows children per type and passes their props", () => {
    const { bar } = mount({ extensions: ["jpg"], sizeValues: [1, 2], durationValues: [5] });
    bar.filter = withFilter({
      type: "video", extIncludes: ["mp4"], extExcludes: ["mkv"], minSize: 1, maxSize: 2,
      minDurationMs: 3, maxDurationMs: 4, minPixels: 5, maxPixels: 6,
    });
    expect(kid("extension-picker")).toMatchObject({ available: ["jpg"], includes: ["mp4"], excludes: ["mkv"] });
    expect(kid("size-range")).toMatchObject({ values: [1, 2], minSize: 1, maxSize: 2 });
    expect(kid("duration-range")).toMatchObject({ values: [5], minMs: 3, maxMs: 4 });
    expect(kid("resolution-range")).toMatchObject({ minPixels: 5, maxPixels: 6 });
    bar.filter = withFilter({ type: "image" });
    expect(kid("duration-range")).toBeNull();
    expect(kid("resolution-range")).not.toBeNull();
    bar.filter = withFilter({ type: "folder" });
    expect(kid("extension-picker")).toBeNull();
    expect(kid("resolution-range")).toBeNull();
  });

  it("turns child change events into filter events", () => {
    const { events } = mount({ filter: withFilter({ type: "video" }) });
    const fire = (tag: string, detail: unknown): void => {
      kid(tag)?.dispatchEvent(new CustomEvent("change", { detail, bubbles: true }));
    };
    fire("extension-picker", { includes: ["a"], excludes: ["b"] });
    fire("size-range", { minSize: 1, maxSize: null });
    fire("duration-range", { minMs: 2, maxMs: 9 });
    fire("resolution-range", { minPixels: 3, maxPixels: null });
    const base = withFilter({ type: "video" });
    expect(events.map((e) => e.detail)).toEqual([
      { ...base, extIncludes: ["a"], extExcludes: ["b"] },
      { ...base, minSize: 1, maxSize: null },
      { ...base, minDurationMs: 2, maxDurationMs: 9 },
      { ...base, minPixels: 3, maxPixels: null },
    ]);
  });

  it("ignores native change events bubbling out of a child", () => {
    const { events } = mount();
    const picker = kid("extension-picker");
    const inner = document.createElement("input");
    picker?.append(inner);
    inner.dispatchEvent(new Event("change", { bubbles: true }));
    picker?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(events).toEqual([]);
  });

  it("emits sort key and direction changes", () => {
    const { bar, events } = mount();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "size" } });
    const dir = screen.getByLabelText("Sort ascending");
    expect(dir).toHaveTextContent("▲");
    expect(dir).not.toHaveAttribute("title");
    fireEvent.click(dir);
    bar.sort = { key: "size", dir: "desc" };
    const desc = screen.getByLabelText("Sort descending");
    expect(desc).toHaveTextContent("▼");
    expect(screen.getByLabelText("Sort by")).toHaveValue("size");
    fireEvent.click(desc);
    expect(events.map((e) => e.detail)).toEqual([
      { ...DEFAULT_SORT, key: "size" },
      { ...DEFAULT_SORT, dir: "desc" },
      { key: "size", dir: "asc" },
    ]);
  });

  it("shows indexing progress and a cancel control", () => {
    const { bar, events } = mount({ indexing: true });
    expect(screen.getByRole("status", { name: "Indexing cloud" })).toHaveTextContent("⟳");
    expect(screen.queryByLabelText("Folders indexed")).toBeNull();
    bar.indexProgress = { folders: 3, entries: 42, path: "/a" };
    expect(screen.getByLabelText("Folders indexed")).toHaveTextContent("📁 3");
    expect(screen.getByLabelText("Entries found")).toHaveTextContent("📄 42");
    fireEvent.click(screen.getByLabelText("Cancel indexing"));
    expect(events).toEqual([{ type: "cancel-index", detail: null }]);
    bar.indexing = false;
    expect(screen.queryByLabelText("Cancel indexing")).toBeNull();
  });
});
