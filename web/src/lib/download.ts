import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { zipStore, type ZipEntry } from "./zip.ts";

/** The archive path of `full` relative to directory `base` (no trailing slash). */
function relativeTo(base: string, full: string): string {
  const prefix = base === "/" ? "/" : `${base}/`;
  return full.slice(prefix.length);
}

/**
 * Recursively collect every file under `entry`: the file itself when it is a
 * file, or all descendant files (depth-first) when it is a directory. Folder
 * zips are built entirely in the browser because dufs's server-side `?zip`
 * returns 404 for subfolders whenever `render-spa` is enabled (the production
 * config), so the server route is unusable for anything but the cloud root.
 */
async function gatherFiles(
  client: DufsClient,
  entry: DirEntry,
): Promise<DirEntry[]> {
  if (entry.kind === "file") return [entry];
  const out: DirEntry[] = [];
  for (const child of await client.list(entry.path)) {
    out.push(...(await gatherFiles(client, child)));
  }
  return out;
}

/**
 * Build a STORE-method zip of `entries` (files and/or folders) rooted at the
 * directory `base`. Archive paths are kept relative to `base`, so a selected
 * folder is reproduced as a nested tree (e.g. `Media/2026/pic.jpg`). Delegates
 * its network reads to the client, so it can be built and asserted without a
 * browser — kept separate from {@link saveBytes} (the DOM trigger).
 */
export async function buildSelectionZip(
  client: DufsClient,
  base: string,
  entries: readonly DirEntry[],
): Promise<Uint8Array<ArrayBuffer>> {
  const zipEntries: ZipEntry[] = [];
  for (const entry of entries) {
    for (const file of await gatherFiles(client, entry)) {
      zipEntries.push({
        name: relativeTo(base, file.path),
        data: await client.downloadBytes(file.path),
      });
    }
  }
  return zipStore(zipEntries);
}

/** Trigger a browser download of `bytes` as `filename` (DOM side effect). */
export function saveBytes(bytes: Uint8Array<ArrayBuffer>, filename: string): void {
  // The buffer type is spelled out because TypeScript 6 narrowed `BlobPart`:
  // a bare `Uint8Array` may be backed by a SharedArrayBuffer, which a Blob
  // cannot take. Everything here builds its bytes with `new Uint8Array(n)`,
  // so this documents what was already true rather than copying to satisfy it.
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
