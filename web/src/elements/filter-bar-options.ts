import type { SortKey, TypeFilter } from "../lib/filter-sort.ts";

/** A select option: the painted glyph (same vocabulary as the grid tiles) and
 * the spoken label screen readers announce instead. */
export interface GlyphOption<V> {
  readonly value: V;
  readonly glyph: string;
  readonly label: string;
}

export const TYPE_OPTIONS: readonly GlyphOption<TypeFilter>[] = [
  { value: "all", glyph: "✱", label: "All types" },
  { value: "folder", glyph: "📁", label: "Folders" },
  { value: "image", glyph: "🖼", label: "Images" },
  { value: "video", glyph: "🎞", label: "Videos" },
  { value: "audio", glyph: "🎵", label: "Audio" },
  { value: "pdf", glyph: "📕", label: "PDFs" },
  { value: "text", glyph: "📝", label: "Text" },
  { value: "other", glyph: "📄", label: "Other" },
];

export const SORT_OPTIONS: readonly GlyphOption<SortKey>[] = [
  // 🏷 (a name tag), not 🔤: that emoji paints the letters "abc".
  { value: "name", glyph: "⇅ 🏷", label: "Sort: Name" },
  { value: "size", glyph: "⇅ ⚖", label: "Sort: Size" },
  { value: "modified", glyph: "⇅ ✏️", label: "Sort: Modified" },
  { value: "created", glyph: "⇅ ✨", label: "Sort: Created" },
  { value: "uploaded", glyph: "⇅ ⭱", label: "Sort: Uploaded" },
  { value: "duration", glyph: "⇅ ⏱", label: "Sort: Duration" },
  { value: "resolution", glyph: "⇅ 📐", label: "Sort: Resolution" },
  { value: "type", glyph: "⇅ 🗂", label: "Sort: Type" },
  { value: "extension", glyph: "⇅ .✱", label: "Sort: Extension" },
];

/** Child range/picker elements report `change` with a detail object; inner
 * native `change` events bubbling through them carry none. */
export function onChildChange(el: HTMLElement, fn: (detail: never) => void): void {
  el.addEventListener("change", (e) => {
    if (e.target === el && e instanceof CustomEvent) fn(e.detail as never);
  });
}
