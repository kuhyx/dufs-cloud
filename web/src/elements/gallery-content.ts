import { h } from "./dom.ts";
import type { GallerySnapshot } from "./gallery-state.ts";

export const SKELETON_TILES = 12;

/** Placeholder tiles shaped like grid cards while the listing loads. */
export function skeletonGrid(): HTMLElement {
  const tiles = Array.from({ length: SKELETON_TILES }, () =>
    h(
      "li",
      { class: "tile skeleton-tile" },
      h("span", { class: "tile-preview" }),
      h("span", { class: "skeleton-line" }),
    ),
  );
  return h("ul", { class: "grid skeleton-grid", "aria-hidden": "true" }, ...tiles);
}

export interface ContentKids {
  readonly skeleton: HTMLElement;
  readonly grid: HTMLElement;
  readonly groups: HTMLElement;
}

/** A large glyph standing for a state; the sentence is its spoken name. */
const note = (cls: string, glyph: string, spoken: string): HTMLElement =>
  h("p", { class: `${cls} state-glyph`, role: cls.includes("error") ? "alert" : "status", "aria-label": spoken }, glyph);

/** The `<main>` children for one snapshot, in the legacy order. */
export function contentNodes(s: GallerySnapshot, kids: ContentKids): HTMLElement[] {
  const { listing, cloudIndex: ci, view, filterActive } = s;
  const showListing = !listing.loading && listing.error === null;
  const searching = showListing && filterActive;
  const browsing = showListing && !filterActive;
  const nodes: (HTMLElement | false)[] = [
    listing.loading && kids.skeleton,
    listing.error !== null && note("error", "⚠", `Could not load: ${listing.error}`),
    searching && !ci.ready && note("muted spinner", "⟳", "Indexing the whole cloud…"),
    searching && ci.partial && h("p", { class: "muted", "aria-label": "Partial index" }, "⚠"),
    searching && ci.ready && ci.error !== null &&
      note("error", "⚠", `Could not index the cloud: ${ci.error}`),
    view.globalMode && view.groups.length === 0 &&
      note("muted", "∅", "Nothing on the cloud matches your filters."),
    view.globalMode && kids.groups,
    browsing && listing.entries.length === 0 && note("muted", "📂", "This folder is empty."),
    browsing && listing.entries.length > 0 && kids.grid,
  ];
  return nodes.filter((n): n is HTMLElement => n !== false);
}
