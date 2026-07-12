import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "./filter-bar.tsx";
import {
  DEFAULT_FILTER,
  DEFAULT_SORT,
  type FilterState,
  type SortState,
} from "../lib/filter-sort.ts";
function renderBar(opts: {
  filter?: FilterState;
  sort?: SortState;
  extensions?: readonly string[];
  sizeValues?: readonly number[];
  durationValues?: readonly number[];
  indexing?: boolean;
} = {}) {
  const onFilter = vi.fn();
  const onSort = vi.fn();
  const onActivate = vi.fn();
  render(
    <FilterBar
      filter={opts.filter ?? DEFAULT_FILTER}
      sort={opts.sort ?? DEFAULT_SORT}
      onFilter={onFilter}
      onSort={onSort}
      extensions={opts.extensions ?? []}
      sizeValues={opts.sizeValues ?? []}
      durationValues={opts.durationValues ?? []}
      indexing={opts.indexing ?? false}
      onActivate={onActivate}
    />,
  );
  return { onFilter, onSort, onActivate };
}

describe("FilterBar", () => {
  it("reports a name-query edit", async () => {
    const { onFilter } = renderBar();
    await userEvent.type(screen.getByLabelText("Filter by name"), "a");
    expect(onFilter).toHaveBeenLastCalledWith({ ...DEFAULT_FILTER, query: "a" });
  });

  it("fires onActivate when a control is focused", async () => {
    const { onActivate } = renderBar();
    await userEvent.click(screen.getByLabelText("Filter by name"));
    expect(onActivate).toHaveBeenCalled();
  });

  it("reports a type selection", () => {
    const { onFilter } = renderBar();
    fireEvent.change(screen.getByLabelText("Filter by type"), {
      target: { value: "video" },
    });
    expect(onFilter).toHaveBeenCalledWith({ ...DEFAULT_FILTER, type: "video" });
  });

  it("routes an extension pick through onFilter", async () => {
    const { onFilter } = renderBar({ extensions: ["jpg", "webp"] });
    await userEvent.click(screen.getByRole("button", { name: /Any ext/ }));
    await userEvent.click(screen.getByLabelText("webp: off"));
    expect(onFilter).toHaveBeenCalledWith({
      ...DEFAULT_FILTER,
      extIncludes: ["webp"],
      extExcludes: [],
    });
  });

  it("hides the extension picker for the folder type", () => {
    renderBar({ filter: { ...DEFAULT_FILTER, type: "folder" } });
    expect(screen.queryByRole("button", { name: /Any ext/ })).toBeNull();
  });

  it("routes a size edit through onFilter", () => {
    const { onFilter } = renderBar();
    fireEvent.change(screen.getByLabelText("Minimum size in MB"), {
      target: { value: "2" },
    });
    expect(onFilter).toHaveBeenCalledWith({
      ...DEFAULT_FILTER,
      minSize: 2 * 1024 * 1024,
    });
  });

  it("shows the duration filter only for the video type", () => {
    renderBar();
    expect(screen.queryByLabelText("Minimum duration in seconds")).toBeNull();
    const { onFilter } = renderBar({
      filter: { ...DEFAULT_FILTER, type: "video" },
    });
    fireEvent.change(screen.getByLabelText("Maximum duration in seconds"), {
      target: { value: "90" },
    });
    expect(onFilter).toHaveBeenCalledWith({
      ...DEFAULT_FILTER,
      type: "video",
      maxDurationMs: 90_000,
    });
  });

  it("reports a sort-key change", () => {
    const { onSort } = renderBar();
    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "size" },
    });
    expect(onSort).toHaveBeenCalledWith({ ...DEFAULT_SORT, key: "size" });
  });

  it("toggles sort direction both ways", async () => {
    const asc = renderBar();
    await userEvent.click(screen.getByLabelText("Sort ascending"));
    expect(asc.onSort).toHaveBeenCalledWith({ ...DEFAULT_SORT, dir: "desc" });

    const desc = renderBar({ sort: { key: "name", dir: "desc" } });
    await userEvent.click(screen.getByLabelText("Sort descending"));
    expect(desc.onSort).toHaveBeenCalledWith({ key: "name", dir: "asc" });
  });

  it("shows an indexing hint while the cloud index builds", () => {
    renderBar({ indexing: true });
    expect(screen.getByText("Indexing cloud…")).toBeInTheDocument();
  });

  it("hides Clear when inactive and resets the filter when active", async () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();

    const active = renderBar({ filter: { ...DEFAULT_FILTER, query: "x" } });
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(active.onFilter).toHaveBeenCalledWith(DEFAULT_FILTER);
  });
});
