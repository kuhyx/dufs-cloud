import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FilterBar } from "./filter-bar.tsx";
import { DEFAULT_FILTER, DEFAULT_SORT, type FilterState } from "../lib/filter-sort.ts";

function bar(over: {
  filter?: FilterState;
  indexing?: boolean;
  onCancelIndex?: () => void;
  indexProgress?: { folders: number; entries: number; path: string };
}) {
  const onFilter = vi.fn();
  const props = {
    filter: over.filter ?? DEFAULT_FILTER,
    sort: DEFAULT_SORT,
    onFilter,
    onSort: vi.fn(),
    extensions: [],
    sizeValues: [],
    durationValues: [],
    indexing: over.indexing ?? false,
    onActivate: vi.fn(),
    indexProgress: over.indexProgress,
    onCancelIndex: over.onCancelIndex,
  };
  const view = render(<FilterBar {...props} />);
  return { onFilter, props, view };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("FilterBar live feedback", () => {
  it("debounces the name query: one onFilter after typing stops", () => {
    vi.useFakeTimers();
    const { onFilter } = bar({});
    const input = screen.getByLabelText("Filter by name");
    fireEvent.change(input, { target: { value: "c" } });
    fireEvent.change(input, { target: { value: "ca" } });
    fireEvent.change(input, { target: { value: "cat" } });
    expect(input).toHaveValue("cat");
    expect(onFilter).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onFilter).toHaveBeenCalledTimes(1);
    expect(onFilter).toHaveBeenCalledWith({ ...DEFAULT_FILTER, query: "cat" });
  });

  it("follows an external reset of the query (Clear)", () => {
    const { props, view } = bar({ filter: { ...DEFAULT_FILTER, query: "dog" } });
    expect(screen.getByLabelText("Filter by name")).toHaveValue("dog");
    view.rerender(<FilterBar {...props} filter={DEFAULT_FILTER} />);
    expect(screen.getByLabelText("Filter by name")).toHaveValue("");
  });

  it("shows the true folder and entry counts as icon + number, no new text", () => {
    bar({
      indexing: true,
      indexProgress: { folders: 12, entries: 340, path: "/Media/2026" },
    });
    expect(screen.getByLabelText("Folders indexed")).toHaveTextContent("12");
    expect(screen.getByLabelText("Entries found")).toHaveTextContent("340");
  });

  it("offers Cancel while indexing and calls onCancelIndex", () => {
    const onCancelIndex = vi.fn();
    bar({ indexing: true, onCancelIndex });
    fireEvent.click(screen.getByRole("button", { name: "Cancel indexing" }));
    expect(onCancelIndex).toHaveBeenCalledTimes(1);
  });

  it("has no Cancel button when not indexing", () => {
    bar({ onCancelIndex: vi.fn() });
    expect(screen.queryByRole("button", { name: "Cancel indexing" })).toBeNull();
  });
});
