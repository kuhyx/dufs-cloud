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
  /** Absolute cloud path of the app-side Matroska proxy, which keeps the
   * embedded subtitle tracks the web proxy strips. Emitted by the indexer and
   * used by the Flutter client only; the web SPA never plays it (browsers
   * cannot decode Matroska). Modelled here so the type matches the JSON. */
  readonly appProxyPath: string | null;
  /** Absolute cloud path of the DIRECTORY holding this video's extracted
   * subtitle tracks and fonts (see `scripts/extract_subtitles.sh`), or null
   * when the video has no embedded text subtitles or has not been processed.
   * Fetch `${subtitlesPath}/tracks.json` to enumerate them. */
  readonly subtitlesPath: string | null;
  /** Absolute cloud path of the DIRECTORY holding this video's DASH segments
   * (see `scripts/generate_dash_streams.sh`), or null. Only dual-audio videos
   * are segmented; the SPA plays those through MSE so it can offer an
   * audio-track picker, which a plain `<video>` cannot because Chrome does not
   * implement `audioTracks`. */
  readonly dashPath: string | null;
}

/** One extracted subtitle track, as listed in a `.subs/<video>/tracks.json`. */
export interface SubtitleTrackEntry {
  /** Index of this stream among the source's subtitle streams (ffmpeg 0:s:N). */
  readonly si: number;
  /** ffprobe codec name, e.g. "ass" or "subrip". */
  readonly codec: string;
  /** ISO-639 language code, or "und" when the source did not tag one. */
  readonly lang: string;
  /** Free-text track title from the container, e.g. "English subs" (may be ""). */
  readonly title: string;
  /** Whether the container marked this track as the default. */
  readonly default: boolean;
  /** File name within the subtitles directory, e.g. "09.pol.ass". */
  readonly file: string;
}

/** The manifest written alongside a video's extracted subtitle tracks. */
export interface SubtitleManifest {
  readonly generatedMs: number;
  /** File names of the fonts attached to the source container, resolved by the
   * client against `${subtitlesPath}/fonts/`. libass needs the release's own
   * faces or it substitutes and the typesetting renders wrong. */
  readonly fonts: readonly string[];
  readonly tracks: readonly SubtitleTrackEntry[];
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
