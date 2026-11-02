// <filter-bar> props: filter, sort, extensions, sizeValues, durationValues, indexing, indexProgress. Events: filter FilterState, sort SortState, activate, cancel-index.
import type { IndexProgress } from "../stores/cloud-index.ts";
import {
  DEFAULT_FILTER,
  DEFAULT_SORT,
  isFilterActive,
  type FilterState,
  type SortKey,
  type SortState,
  type TypeFilter,
} from "../lib/filter-sort.ts";
import { h } from "./dom.ts";
import { define, emit, reactive, setProps, syncChildren, upgradeProps } from "./element-kit.ts";
import { SORT_OPTIONS, TYPE_OPTIONS, onChildChange } from "./filter-bar-options.ts";

/** Quiet time after the last keystroke before the query reaches the filter. */
const QUERY_DEBOUNCE_MS = 200;
const PROPS = [
  "filter", "sort", "extensions", "sizeValues", "durationValues", "indexing", "indexProgress",
] as const;

type Child = HTMLElement & Record<string, unknown>;
const child = (tag: string): Child => document.createElement(tag) as Child;

export class FilterBar extends HTMLElement {
  declare filter: FilterState;
  declare sort: SortState;
  declare extensions: readonly string[];
  declare sizeValues: readonly number[];
  declare durationValues: readonly number[];
  declare indexing: boolean;
  declare indexProgress: IndexProgress | undefined;
  readonly props: Record<string, unknown> = {
    filter: DEFAULT_FILTER, sort: DEFAULT_SORT, extensions: [], sizeValues: [],
    durationValues: [], indexing: false, indexProgress: undefined,
  };
  #seen = "";
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #bar = h("div", { class: "filterbar" });
  readonly #query = h("input", {
    class: "filter-query", type: "search", placeholder: "Filter by name…", "aria-label": "Filter by name",
  });
  readonly #type = h("select", { "aria-label": "Filter by type" },
    ...TYPE_OPTIONS.map((o) => h("option", { value: o.value }, o.label)));
  readonly #sortKey = h("select", { "aria-label": "Sort by" },
    ...SORT_OPTIONS.map((o) => h("option", { value: o.value }, `Sort: ${o.label}`)));
  readonly #dir = h("button", { type: "button", class: "filter-dir" });
  readonly #busy = h("span", { class: "busy" });
  readonly #cancel = h("button", { type: "button", class: "filter-clear", "aria-label": "Cancel indexing" }, "✕");
  readonly #clear = h("button", { type: "button", class: "filter-clear" }, "Clear");
  readonly #ext = child("extension-picker");
  readonly #size = child("size-range");
  readonly #duration = child("duration-range");
  readonly #resolution = child("resolution-range");

  constructor() {
    super();
    const patch = (change: Partial<FilterState>): void => {
      emit(this, "filter", { ...this.filter, ...change });
    };
    this.#bar.addEventListener("focusin", () => {
      emit(this, "activate");
    });
    this.#query.addEventListener("input", () => {
      const query = this.#query.value;
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => {
        patch({ query });
      }, QUERY_DEBOUNCE_MS);
    });
    this.#type.addEventListener("change", () => {
      patch({ type: this.#type.value as TypeFilter });
    });
    onChildChange(this.#ext, (d: { includes: readonly string[]; excludes: readonly string[] }) => {
      patch({ extIncludes: d.includes, extExcludes: d.excludes });
    });
    onChildChange(this.#size, patch);
    onChildChange(this.#duration, (d: { minMs: number | null; maxMs: number | null }) => {
      patch({ minDurationMs: d.minMs, maxDurationMs: d.maxMs });
    });
    onChildChange(this.#resolution, patch);
    this.#sortKey.addEventListener("change", () => {
      emit(this, "sort", { ...this.sort, key: this.#sortKey.value as SortKey });
    });
    this.#dir.addEventListener("click", () => {
      emit(this, "sort", { ...this.sort, dir: this.sort.dir === "asc" ? "desc" : "asc" });
    });
    this.#cancel.addEventListener("click", () => {
      emit(this, "cancel-index");
    });
    this.#clear.addEventListener("click", () => {
      clearTimeout(this.#timer);
      emit(this, "filter", DEFAULT_FILTER);
    });
    upgradeProps(this, PROPS);
  }

  connectedCallback(): void {
    if (this.#bar.parentNode !== this) this.append(this.#bar);
    this.render();
  }

  disconnectedCallback(): void {
    clearTimeout(this.#timer);
  }

  render(): void {
    const f = this.filter;
    if (f.query !== this.#seen) {
      this.#seen = f.query;
      this.#query.value = f.query;
    }
    this.#type.value = f.type;
    this.#sortKey.value = this.sort.key;
    const asc = this.sort.dir === "asc";
    this.#dir.setAttribute("aria-label", asc ? "Sort ascending" : "Sort descending");
    this.#dir.title = asc ? "Ascending" : "Descending";
    this.#dir.textContent = asc ? "▲" : "▼";
    setProps(this.#ext, { available: this.extensions, includes: f.extIncludes, excludes: f.extExcludes });
    setProps(this.#size, { values: this.sizeValues, minSize: f.minSize, maxSize: f.maxSize });
    setProps(this.#duration, { values: this.durationValues, minMs: f.minDurationMs, maxMs: f.maxDurationMs });
    setProps(this.#resolution, { minPixels: f.minPixels, maxPixels: f.maxPixels });
    const p = this.indexProgress;
    this.#busy.replaceChildren(
      "Indexing cloud…",
      ...(p === undefined
        ? []
        : [
            h("span", { "aria-label": "Folders indexed" }, ` 📁 ${p.folders}`),
            h("span", { "aria-label": "Entries found" }, ` 📄 ${p.entries}`),
          ]),
    );
    const media = f.type === "image" || f.type === "video";
    const parts: (HTMLElement | false)[] = [
      this.#query, this.#type, f.type !== "folder" && this.#ext, this.#size,
      f.type === "video" && this.#duration, media && this.#resolution,
      this.#sortKey, this.#dir, this.indexing && this.#busy, this.indexing && this.#cancel,
      isFilterActive(f) && this.#clear,
    ];
    syncChildren(this.#bar, parts.filter((n): n is HTMLElement => n !== false));
  }
}

reactive(FilterBar, PROPS);
define("filter-bar", FilterBar);
