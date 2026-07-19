/** Path and file-type helpers for cloud paths (absolute, from the cloud root). */

const IMAGE_EXTS = new Set([
  "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp",
  "heic", "heif", "avif", "svg",
]);
const VIDEO_EXTS = new Set([
  "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v",
  "3gp", "ogv", "mpg", "mpeg", "mts", "m2ts", "vob",
]);
const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "log", "csv", "json", "yaml", "yml",
  "ini", "conf", "sh", "toml", "xml", "py", "js", "html", "css", "tex",
  "ipynb",
]);
const PDF_EXTS = new Set(["pdf"]);
const AUDIO_EXTS = new Set([
  "mp3", "wav", "m4a", "aac", "ogg", "flac", "wma", "opus",
]);

/** Lower-case extension without the dot, or "" if none. */
export function extname(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function isImage(name: string): boolean {
  return IMAGE_EXTS.has(extname(name));
}
export function isVideo(name: string): boolean {
  return VIDEO_EXTS.has(extname(name));
}
export function isText(name: string): boolean {
  return TEXT_EXTS.has(extname(name));
}
export function isPdf(name: string): boolean {
  return PDF_EXTS.has(extname(name));
}
export function isAudio(name: string): boolean {
  return AUDIO_EXTS.has(extname(name));
}

/** Normalize to a leading-slash, no-trailing-slash absolute path ("/" stays "/"). */
export function normalize(path: string): string {
  const parts = path.split("/").filter((p) => p.length > 0 && p !== ".");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else out.push(p);
  }
  return "/" + out.join("/");
}

export function joinPath(base: string, name: string): string {
  return normalize(`${base}/${name}`);
}

export function parentPath(path: string): string {
  const n = normalize(path);
  if (n === "/") return "/";
  return normalize(n.slice(0, n.lastIndexOf("/")) || "/");
}

export function basename(path: string): string {
  const n = normalize(path);
  if (n === "/") return "/";
  return n.slice(n.lastIndexOf("/") + 1);
}

/** Encode an absolute path into a same-origin URL, encoding each segment. */
export function encodePath(path: string): string {
  return (
    "/" +
    normalize(path)
      .split("/")
      .filter((p) => p.length > 0)
      .map((p) => encodeURIComponent(p))
      .join("/")
  );
}

/** Breadcrumb segments for a path: [{name, path}], root first. */
export function crumbs(path: string): readonly { name: string; path: string }[] {
  const n = normalize(path);
  const out: { name: string; path: string }[] = [{ name: "cloud", path: "/" }];
  if (n === "/") return out;
  let acc = "";
  for (const seg of n.split("/").filter((p) => p.length > 0)) {
    acc += "/" + seg;
    out.push({ name: seg, path: acc });
  }
  return out;
}

/** True when `path` is `base` itself or lives anywhere beneath it. Root ("/")
 * contains everything. Matches on a "/"-terminated prefix so "/Media/07" does
 * NOT swallow "/Media/0700". */
export function underPath(path: string, base: string): boolean {
  if (base === "/") return true;
  return path === base || path.startsWith(`${base}/`);
}

/** The subset of `paths` that may legally be dropped into `destDir`.
 *
 * Drops the two cases the server cannot sensibly answer: a folder dragged
 * onto itself or into its own descendant (which would orphan the subtree),
 * and an item already living directly in `destDir` (a no-op move). */
export function movableInto(
  paths: readonly string[],
  destDir: string,
): readonly string[] {
  return paths.filter(
    (p) => !underPath(destDir, p) && parentPath(p) !== normalize(destDir),
  );
}

/** Human-readable duration, split into h/m/s (e.g. 5073000 ms → "1h 24m 33s").
 * Trailing zero units are dropped; "0s" for a zero (or sub-second) duration. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${String(h)}h`);
  if (m > 0) parts.push(`${String(m)}m`);
  if (s > 0 || parts.length === 0) parts.push(`${String(s)}s`);
  return parts.join(" ");
}

/** Human-readable byte size. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let v = bytes / 1024;
  let unit = "KB";
  for (const next of ["MB", "GB", "TB"]) {
    if (v < 1024) break;
    v /= 1024;
    unit = next;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${unit}`;
}
