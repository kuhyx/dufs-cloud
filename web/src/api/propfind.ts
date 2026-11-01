import type { DirEntry, EntryKind } from "./types.ts";
import { basename, normalize } from "../lib/paths.ts";

const DAV_NS = "DAV:";

/** Parse a dufs PROPFIND multistatus XML body into entries under `dirPath`. */
export function parsePropfind(xml: string, dirPath: string): DirEntry[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const self = normalize(dirPath);
  const responses = Array.from(doc.getElementsByTagNameNS(DAV_NS, "response"));
  const entries: DirEntry[] = [];
  for (const res of responses) {
    const hrefEl = res.getElementsByTagNameNS(DAV_NS, "href")[0];
    const rawHref = hrefEl?.textContent;
    // TypeScript 6 types `textContent` as `string`, so the optional chain
    // above yields `string | undefined` and an explicit `=== null` arm is
    // now unreachable. A falsy check still covers empty as it always did.
    if (rawHref === undefined || rawHref === "") continue;
    // href is URL-encoded and absolute; decode and normalize.
    const path = normalize(decodeURIComponent(rawHref));
    if (path === self) continue; // skip the directory itself
    const isDir =
      res.getElementsByTagNameNS(DAV_NS, "collection").length > 0;
    const kind: EntryKind = isDir ? "dir" : "file";
    const sizeText = res
      .getElementsByTagNameNS(DAV_NS, "getcontentlength")[0]
      ?.textContent;
    const size = sizeText !== undefined ? Number(sizeText) : 0;
    const mtimeText = res
      .getElementsByTagNameNS(DAV_NS, "getlastmodified")[0]
      ?.textContent;
    const mtimeMs = mtimeText !== undefined ? Date.parse(mtimeText) || 0 : 0;
    entries.push({
      name: basename(path),
      path,
      kind,
      size: Number.isFinite(size) ? size : 0,
      mtimeMs,
    });
  }
  return entries;
}

/** Sort: directories first, then by name (locale, case-insensitive). */
export function sortEntries(entries: readonly DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
