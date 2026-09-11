import { humanSize } from "./paths.ts";

/**
 * One file's place in a multi-file transfer: which file (1-based `index` of
 * `total`) and how many of its `size` bytes are `done`. Sizes come from the
 * picked File (uploads) or the PROPFIND listing (downloads), never from
 * Content-Length, so progress is deterministic and testable. Mirrors the
 * Flutter app's TransferProgress so both banners read the same.
 */
export interface TransferProgress {
  readonly kind: "upload" | "download";
  readonly index: number;
  readonly total: number;
  readonly name: string;
  readonly done: number;
  readonly size: number;
}

/** Completed fraction of the current file, or null when the size is unknown. */
export function transferFraction(p: TransferProgress): number | null {
  return p.size <= 0 ? null : Math.min(1, p.done / p.size);
}

/** First banner line: `Uploading 3/7 · photo.jpg`. */
export function transferTitle(p: TransferProgress): string {
  const verb = p.kind === "upload" ? "Uploading" : "Downloading";
  return `${verb} ${p.index}/${p.total} · ${p.name}`;
}

/** Second banner line: `42 % · 12.3 MB / 29.1 MB` (bytes only while unknown). */
export function transferDetail(p: TransferProgress): string {
  const f = transferFraction(p);
  if (f === null) return humanSize(p.done);
  return `${Math.floor(f * 100)} % · ${humanSize(p.done)} / ${humanSize(p.size)}`;
}

/** Whether `err` is the abort a Cancel button produces. */
export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
