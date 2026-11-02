import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_FILTER,
  isFilterActive,
  type FilterState,
  type SortKey,
  type SortState,
  type TypeFilter,
} from "../lib/filter-sort.ts";
import type { IndexProgress } from "../hooks/use-cloud-index.ts";
import { SizeRange } from "./size-range.tsx";
import { DurationRange } from "./duration-range.tsx";
import { ResolutionRange } from "./resolution-range.tsx";
import { ExtensionPicker } from "./extension-picker.tsx";

interface FilterBarProps {
  readonly filter: FilterState;
  readonly sort: SortState;
  readonly onFilter: (f: FilterState) => void;
  readonly onSort: (s: SortState) => void;
  /** Extensions present in scope (for the picker); empty until indexed. */
  readonly extensions: readonly string[];
  /** Ascending file sizes (bytes) in scope; empty until the index loads. */
  readonly sizeValues: readonly number[];
  /** Ascending video durations (ms) in scope; empty when none are indexed. */
  readonly durationValues: readonly number[];
  /** True while the whole-cloud index is being built. */
  readonly indexing: boolean;
  /** Fired on first interaction so the parent can start the lazy index walk. */
  readonly onActivate: () => void;
  /** Live counts of the index walk, shown as icon + number while `indexing`. */
  readonly indexProgress?: IndexProgress;
  /** Stops the index walk; the cancel control shows only while `indexing`. */
  readonly onCancelIndex?: () => void;
}

/** Quiet time after the last keystroke before the query reaches the filter, so
 * a large index is not re-filtered on every character. */
const QUERY_DEBOUNCE_MS = 200;

const TYPE_OPTIONS: readonly { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "folder", label: "Folders" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "pdf", label: "PDFs" },
  { value: "text", label: "Text" },
  { value: "other", label: "Other" },
];

const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
  { value: "modified", label: "Modified" },
  { value: "created", label: "Created" },
  { value: "uploaded", label: "Uploaded" },
  { value: "duration", label: "Duration" },
  { value: "resolution", label: "Resolution" },
  { value: "type", label: "Type" },
  { value: "extension", label: "Extension" },
];

/**
 * The filter/sort control strip. Every control is fully controlled: it reads
 * from `filter`/`sort` and reports edits through the callbacks, so the parent
 * ({@link Gallery}) owns the single source of truth that feeds
 * {@link applyFilterSort}. Focusing any control fires `onActivate`, which lets
 * the parent kick off the lazy index that powers scoped filtering, the extension
 * picker, and the size/duration ranges.
 */
export function FilterBar({
  filter,
  sort,
  onFilter,
  onSort,
  extensions,
  sizeValues,
  durationValues,
  indexing,
  onActivate,
  indexProgress,
  onCancelIndex,
}: FilterBarProps): React.JSX.Element {
  const [draft, setDraft] = useState(filter.query);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The parent can change the query itself (Clear, folder change): follow it.
  const [seen, setSeen] = useState(filter.query);
  if (filter.query !== seen) {
    setSeen(filter.query);
    setDraft(filter.query);
  }
  useEffect(() => () => {
    clearTimeout(timer.current);
  }, []);
  const editQuery = (query: string): void => {
    setDraft(query);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onFilter({ ...filter, query });
    }, QUERY_DEBOUNCE_MS);
  };
  return (
    <div className="filterbar" onFocus={onActivate}>
      <input
        className="filter-query"
        type="search"
        placeholder="Filter by name…"
        aria-label="Filter by name"
        value={draft}
        onChange={(e) => {
          editQuery(e.target.value);
        }}
      />
      <select
        aria-label="Filter by type"
        value={filter.type}
        onChange={(e) => {
          onFilter({ ...filter, type: e.target.value as TypeFilter });
        }}
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Folders have no extension, so the picker is meaningless there. */}
      {filter.type !== "folder" && (
        <ExtensionPicker
          available={extensions}
          includes={filter.extIncludes}
          excludes={filter.extExcludes}
          onChange={(includes, excludes) => {
            onFilter({ ...filter, extIncludes: includes, extExcludes: excludes });
          }}
        />
      )}
      <SizeRange
        values={sizeValues}
        minSize={filter.minSize}
        maxSize={filter.maxSize}
        onChange={(minSize, maxSize) => {
          onFilter({ ...filter, minSize, maxSize });
        }}
      />
      {filter.type === "video" && (
        <DurationRange
          values={durationValues}
          minMs={filter.minDurationMs}
          maxMs={filter.maxDurationMs}
          onChange={(minDurationMs, maxDurationMs) => {
            onFilter({ ...filter, minDurationMs, maxDurationMs });
          }}
        />
      )}
      {(filter.type === "image" || filter.type === "video") && (
        <ResolutionRange
          minPixels={filter.minPixels}
          maxPixels={filter.maxPixels}
          onChange={(minPixels, maxPixels) => {
            onFilter({ ...filter, minPixels, maxPixels });
          }}
        />
      )}
      <select
        aria-label="Sort by"
        value={sort.key}
        onChange={(e) => {
          onSort({ ...sort, key: e.target.value as SortKey });
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            Sort: {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="filter-dir"
        aria-label={sort.dir === "asc" ? "Sort ascending" : "Sort descending"}
        title={sort.dir === "asc" ? "Ascending" : "Descending"}
        onClick={() => {
          onSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" });
        }}
      >
        {sort.dir === "asc" ? "▲" : "▼"}
      </button>
      {indexing && (
        <span className="busy">
          Indexing cloud…
          {indexProgress !== undefined && (
            <>
              <span aria-label="Folders indexed"> 📁 {indexProgress.folders}</span>
              <span aria-label="Entries found"> 📄 {indexProgress.entries}</span>
            </>
          )}
        </span>
      )}
      {indexing && onCancelIndex !== undefined && (
        <button
          type="button"
          className="filter-clear"
          aria-label="Cancel indexing"
          onClick={onCancelIndex}
        >
          ✕
        </button>
      )}
      {isFilterActive(filter) && (
        <button
          type="button"
          className="filter-clear"
          onClick={() => {
            clearTimeout(timer.current);
            onFilter(DEFAULT_FILTER);
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
