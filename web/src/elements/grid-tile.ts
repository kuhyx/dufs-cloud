import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { humanSize, isAudio, isImage, isPdf, isText, isVideo } from "../lib/paths.ts";
import { h } from "./dom.ts";

/** Custom type keeps our own drags distinguishable from OS file drags. */
export const DRAG_TYPE = "application/x-dufs-paths";

export function draggedPaths(data: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

export interface TileHost {
  readonly dragEnabled: boolean;
  readonly selected: ReadonlySet<string>;
  setDropTarget: (path: string | null) => void;
  fire: (type: string, detail: unknown) => void;
}

export interface Tile {
  readonly entry: DirEntry;
  readonly li: HTMLLIElement;
  readonly checkbox: HTMLInputElement;
}

function thumb(client: DufsClient, entry: DirEntry): HTMLElement {
  const img = h("img", {
    class: "thumb-img",
    src: client.thumbUrl(entry.path),
    alt: entry.name,
    loading: "lazy",
  });
  img.addEventListener("error", () => {
    img.replaceWith(
      h("div", { class: "thumb-fallback" }, isVideo(entry.name) ? "🎞" : "🖼"),
    );
  });
  return img;
}

function fileIcon(name: string): string {
  if (isPdf(name)) return "📕";
  if (isAudio(name)) return "🎵";
  if (isText(name)) return "📝";
  return "📄";
}

function preview(client: DufsClient, entry: DirEntry, hasThumb: boolean): HTMLElement {
  const box = h("span", { class: "tile-preview" });
  if (entry.kind === "dir") box.append(h("span", { class: "tile-icon" }, "📁"));
  else if (!hasThumb) box.append(h("span", { class: "tile-icon" }, fileIcon(entry.name)));
  else {
    box.append(thumb(client, entry));
    if (isVideo(entry.name)) box.append(h("span", { class: "play-badge" }, "▶"));
  }
  return box;
}

function actions(host: TileHost, client: DufsClient, entry: DirEntry): HTMLElement {
  const act = (cls: string, label: string, icon: string, type: string): HTMLElement =>
    h(
      "button",
      { type: "button", class: cls, "aria-label": `${label} ${entry.name}`, onClick: () => {
        host.fire(type, entry);
      } },
      icon,
    );
  return h(
    "div",
    { class: "tile-actions" },
    h("a", {
      class: "tile-act",
      href: client.fileUrl(entry.path),
      download: true,
      "aria-label": `Download ${entry.name}`,
    }, "⭳"),
    act("tile-act", "Rename", "✏️", "rename"),
    act("tile-act danger", "Delete", "🗑", "delete"),
  );
}

type DragHandler = (e: DragEvent, dt: DataTransfer) => void;

function onDrag(li: HTMLLIElement, type: "dragstart" | "dragover" | "drop", fn: DragHandler): void {
  li.addEventListener(type, (e) => {
    if (e.dataTransfer) fn(e, e.dataTransfer);
  });
}

function wireDrag(li: HTMLLIElement, host: TileHost, entry: DirEntry): void {
  const canReceive = (): boolean => host.dragEnabled && entry.kind === "dir";
  onDrag(li, "dragstart", (_e, dt) => {
    const paths = host.selected.has(entry.path) ? [...host.selected] : [entry.path];
    dt.setData(DRAG_TYPE, JSON.stringify(paths));
    dt.effectAllowed = "move";
  });
  onDrag(li, "dragover", (e, dt) => {
    if (!canReceive()) return;
    e.preventDefault();
    e.stopPropagation();
    dt.dropEffect = dt.types.includes("Files") ? "copy" : "move";
    host.setDropTarget(entry.path);
  });
  li.addEventListener("dragleave", () => {
    if (canReceive()) host.setDropTarget(null);
  });
  onDrag(li, "drop", (e, dt) => {
    if (!canReceive()) return;
    e.preventDefault();
    // The grid background would otherwise upload into the viewed folder too.
    e.stopPropagation();
    host.setDropTarget(null);
    if (dt.files.length > 0) {
      host.fire("upload-into", { destDir: entry.path, files: dt.files });
      return;
    }
    const paths = draggedPaths(dt.getData(DRAG_TYPE));
    if (paths.length > 0) host.fire("move-into", { destDir: entry.path, paths });
  });
}

export function buildTile(host: TileHost, client: DufsClient, entry: DirEntry): Tile {
  const hasThumb = isImage(entry.name) || isVideo(entry.name);
  const opensViewer = hasThumb || isPdf(entry.name) || isAudio(entry.name);
  const checkbox = h("input", { type: "checkbox", "aria-label": `Select ${entry.name}` });
  checkbox.addEventListener("click", (e) => {
    host.fire("toggle-select", { entry, shiftKey: e.shiftKey });
  });
  const activate = (): void => {
    if (entry.kind === "dir") host.fire("open-dir", entry.path);
    else if (opensViewer) host.fire("open-media", entry);
    else if (isText(entry.name)) host.fire("edit-text", entry);
  };
  const main = h(
    "button",
    { type: "button", class: "tile-main", onClick: activate },
    preview(client, entry, hasThumb),
    h("span", { class: "tile-name", title: entry.name }, entry.name),
    entry.kind === "file" && h("span", { class: "tile-size" }, humanSize(entry.size)),
  );
  const li = h(
    "li",
    {},
    h("label", { class: "tile-select" }, checkbox),
    main,
    entry.kind === "file" && actions(host, client, entry),
  );
  wireDrag(li, host, entry);
  return { entry, li, checkbox };
}
