export type EntryKind = "dir" | "file";

/** Extra per-file metadata from the server-side index (see build_media_index).
 * All fields are nullable: absent for files the indexer has not processed. */
export interface MediaMeta {
  /** Pixel width (images and videos), or null. */
  readonly width: number | null;
  /** Pixel height (images and videos), or null. */
  readonly height: number | null;
  /** Video duration in milliseconds, or null for non-videos. */
  readonly durationMs: number | null;
  /** Original creation time (EXIF/birth) in epoch ms, or null. */
  readonly createdMs: number | null;
  /** When the indexer first saw the file (≈ upload time) in epoch ms, or null. */
  readonly uploadedMs: number | null;
  /** Absolute cloud path of a browser-safe MP4 proxy for this video (see
   * `scripts/generate_video_proxies.sh`), or null when either this isn't a
   * video or the original already plays fine as-is. */
  readonly proxyPath: string | null;
}

/** The metadata index: a map from absolute cloud path to its {@link MediaMeta}. */
export type MetaIndex = Readonly<Record<string, MediaMeta>>;

/** One entry in a directory listing, as returned by the dufs WebDAV PROPFIND. */
export interface DirEntry {
  /** Base name, e.g. "pic.jpg". */
  readonly name: string;
  /** Absolute path from the cloud root, e.g. "/Media/2026/07/pic.jpg". */
  readonly path: string;
  readonly kind: EntryKind;
  /** Size in bytes (0 for directories). */
  readonly size: number;
  /** Last-modified time in epoch milliseconds (0 if unknown). */
  readonly mtimeMs: number;
}
