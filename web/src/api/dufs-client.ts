import type { DirEntry, EntryKind, MetaIndex } from "./types.ts";
import { basename, encodePath, joinPath, normalize } from "../lib/paths.ts";

const DAV_NS = "DAV:";

/** Client over the dufs WebDAV + HTTP API (same-origin; browser supplies auth). */
export interface DufsClient {
  /** List a directory via WebDAV PROPFIND (works under dufs `render-spa`). */
  list(dirPath: string): Promise<DirEntry[]>;
  /** Same-origin URL to fetch/stream a file's raw bytes. */
  fileUrl(path: string): string;
  /** URL of the generated thumbnail for a media entry (see generate_thumbnails.sh). */
  thumbUrl(path: string): string;
  /** URL that downloads a directory as a zip (dufs `?zip`). */
  zipUrl(dirPath: string): string;
  upload(dirPath: string, file: File): Promise<void>;
  remove(path: string): Promise<void>;
  /** Create a directory at `path` (WebDAV MKCOL). */
  createDir(path: string): Promise<void>;
  /** Move `fromPath` into directory `destDir`, keeping its base name (MOVE). */
  move(fromPath: string, destDir: string): Promise<void>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  /** Fetch the server metadata index; resolves to `{}` when absent. */
  fetchMeta(): Promise<MetaIndex>;
  /** Download a file's raw bytes (used to build multi-file zips). */
  downloadBytes(path: string): Promise<Uint8Array>;
}

/** Parse a dufs PROPFIND multistatus XML body into entries under `dirPath`. */
export function parsePropfind(xml: string, dirPath: string): DirEntry[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const self = normalize(dirPath);
  const responses = Array.from(doc.getElementsByTagNameNS(DAV_NS, "response"));
  const entries: DirEntry[] = [];
  for (const res of responses) {
    const hrefEl = res.getElementsByTagNameNS(DAV_NS, "href")[0];
    const rawHref = hrefEl?.textContent;
    if (rawHref === null || rawHref === undefined || rawHref === "") continue;
    // href is URL-encoded and absolute; decode and normalize.
    const path = normalize(decodeURIComponent(rawHref));
    if (path === self) continue; // skip the directory itself
    const isDir =
      res.getElementsByTagNameNS(DAV_NS, "collection").length > 0;
    const kind: EntryKind = isDir ? "dir" : "file";
    const sizeText = res
      .getElementsByTagNameNS(DAV_NS, "getcontentlength")[0]
      ?.textContent;
    const size = sizeText !== null && sizeText !== undefined ? Number(sizeText) : 0;
    const mtimeText = res
      .getElementsByTagNameNS(DAV_NS, "getlastmodified")[0]
      ?.textContent;
    const mtimeMs =
      mtimeText !== null && mtimeText !== undefined
        ? Date.parse(mtimeText) || 0
        : 0;
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

export function createDufsClient(fetchImpl: typeof fetch = fetch): DufsClient {
  // `method` is always supplied by callers, so the error message and the fetch
  // options never need to fall back — keeping it a required arg avoids an
  // unreachable default branch.
  async function request(
    method: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const res = await fetchImpl(encodePath(path), {
      method,
      credentials: "same-origin",
      ...init,
    });
    if (!res.ok) {
      throw new Error(`${method} ${path} → ${res.status}`);
    }
    return res;
  }

  return {
    async list(dirPath) {
      const res = await request("PROPFIND", dirPath, {
        headers: { Depth: "1" },
      });
      return sortEntries(parsePropfind(await res.text(), dirPath));
    },
    fileUrl(path) {
      return encodePath(path);
    },
    thumbUrl(path) {
      return encodePath(`/.thumbs${normalize(path)}.jpg`);
    },
    zipUrl(dirPath) {
      return `${encodePath(dirPath)}?zip`;
    },
    async upload(dirPath, file) {
      await request("PUT", joinPath(dirPath, file.name), { body: file });
    },
    async remove(path) {
      await request("DELETE", path);
    },
    async createDir(path) {
      await request("MKCOL", path);
    },
    async move(fromPath, destDir) {
      const dest = joinPath(destDir, basename(fromPath));
      await request("MOVE", fromPath, {
        headers: { Destination: encodePath(dest), Overwrite: "F" },
      });
    },
    async readText(path) {
      return (await request("GET", path)).text();
    },
    async writeText(path, content) {
      await request("PUT", path, { body: content });
    },
    async fetchMeta() {
      // Tolerant by contract: a missing index, a non-ok status, a network
      // failure (offline), or malformed JSON all resolve to {} — the index is
      // an optional enrichment, never a hard dependency of the listing.
      try {
        const res = await fetchImpl(encodePath("/.meta/index.json"), {
          credentials: "same-origin",
        });
        if (!res.ok) return {};
        const data: unknown = await res.json();
        return isMetaIndex(data) ? data.entries : {};
      } catch {
        return {};
      }
    },
    async downloadBytes(path) {
      const res = await request("GET", path);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

interface MetaFile {
  readonly entries: MetaIndex;
}

/** Narrow parsed JSON to the metadata index shape (tolerant of extra fields). */
function isMetaIndex(data: unknown): data is MetaFile {
  if (typeof data !== "object" || data === null || !("entries" in data)) {
    return false;
  }
  const { entries } = data;
  return typeof entries === "object" && entries !== null;
}
