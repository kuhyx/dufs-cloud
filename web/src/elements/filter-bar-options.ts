import type { SortKey, TypeFilter } from "../lib/filter-sort.ts";

export const TYPE_OPTIONS: readonly { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "folder", label: "Folders" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "pdf", label: "PDFs" },
  { value: "text", label: "Text" },
  { value: "other", label: "Other" },
];

export const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
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

/** Child range/picker elements report `change` with a detail object; inner
 * native `change` events bubbling through them carry none. */
export function onChildChange(el: HTMLElement, fn: (detail: never) => void): void {
  el.addEventListener("change", (e) => {
    if (e.target === el && e instanceof CustomEvent) fn(e.detail as never);
  });
}
