import { useState } from "react";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import {
  humanSize,
  isAudio,
  isImage,
  isPdf,
  isText,
  isVideo,
} from "../lib/paths.ts";

interface GridProps {
  readonly client: DufsClient;
  readonly entries: readonly DirEntry[];
  readonly selected: ReadonlySet<string>;
  readonly onToggleSelect: (entry: DirEntry, shiftKey: boolean) => void;
  readonly onOpenDir: (path: string) => void;
  readonly onOpenMedia: (entry: DirEntry) => void;
  readonly onEditText: (entry: DirEntry) => void;
  readonly onDelete: (entry: DirEntry) => void;
  readonly onRename: (entry: DirEntry) => void;
  /** Drag-to-move/upload wiring. Omitted in global search mode, where the
   * grouped results span folders and a drop target would be ambiguous. */
  readonly onMoveInto?: (destDir: string, paths: readonly string[]) => void;
  readonly onUploadInto?: (destDir: string, files: FileList) => void;
}

/** Internal drag payload: the dragged entry paths, JSON-encoded. A custom
 * type keeps our own drags distinguishable from files dragged in from the OS. */
const DRAG_TYPE = "application/x-dufs-paths";

/** Reads the dragged paths back out, tolerating a drag that isn't ours. */
function draggedPaths(data: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

function Thumb({
  client,
  entry,
}: {
  readonly client: DufsClient;
  readonly entry: DirEntry;
}): React.JSX.Element {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return <div className="thumb-fallback">{isVideo(entry.name) ? "🎞" : "🖼"}</div>;
  }
  return (
    <img
      className="thumb-img"
      src={client.thumbUrl(entry.path)}
      alt={entry.name}
      loading="lazy"
      onError={() => {
        setBroken(true);
      }}
    />
  );
}

export function Grid({
  client,
  entries,
  selected,
  onToggleSelect,
  onOpenDir,
  onOpenMedia,
  onEditText,
  onDelete,
  onRename,
  onMoveInto,
  onUploadInto,
}: GridProps): React.JSX.Element {
  // The folder tile currently under the pointer during a drag, highlighted so
  // it is obvious where a drop will land.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragEnabled = onMoveInto !== undefined || onUploadInto !== undefined;
  return (
    <ul className="grid">
      {entries.map((entry) => {
        const hasThumb = isImage(entry.name) || isVideo(entry.name);
        const opensViewer =
          hasThumb || isPdf(entry.name) || isAudio(entry.name);
        const isSel = selected.has(entry.path);
        const activate = (): void => {
          if (entry.kind === "dir") onOpenDir(entry.path);
          else if (opensViewer) onOpenMedia(entry);
          else if (isText(entry.name)) onEditText(entry);
        };
        const isDropTarget = dropTarget === entry.path;
        // Only folders can receive a drop, and only while dragging is wired up.
        const canReceive = dragEnabled && entry.kind === "dir";
        return (
          <li
            key={entry.path}
            className={`tile tile-${entry.kind}${isSel ? " tile-selected" : ""}${
              isDropTarget ? " tile-drop" : ""
            }`}
            draggable={dragEnabled}
            onDragStart={(e) => {
              // Dragging a selected item carries the whole selection; dragging
              // an unselected one carries just itself and leaves it alone.
              const paths = isSel ? [...selected] : [entry.path];
              e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(paths));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={
              canReceive
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const files = e.dataTransfer.types.includes("Files");
                    e.dataTransfer.dropEffect = files ? "copy" : "move";
                    setDropTarget(entry.path);
                  }
                : undefined
            }
            onDragLeave={
              canReceive
                ? () => {
                    setDropTarget(null);
                  }
                : undefined
            }
            onDrop={
              canReceive
                ? (e) => {
                    e.preventDefault();
                    // Keep the drop from also reaching the grid background,
                    // which uploads into the folder being viewed.
                    e.stopPropagation();
                    setDropTarget(null);
                    if (e.dataTransfer.files.length > 0) {
                      onUploadInto?.(entry.path, e.dataTransfer.files);
                      return;
                    }
                    const paths = draggedPaths(
                      e.dataTransfer.getData(DRAG_TYPE),
                    );
                    if (paths.length > 0) onMoveInto?.(entry.path, paths);
                  }
                : undefined
            }
          >
            <label className="tile-select">
              <input
                type="checkbox"
                checked={isSel}
                aria-label={`Select ${entry.name}`}
                // React routes a checkbox's change through the click event,
                // so the modifier state is on the native event. Toggling
                // here rather than in onClick+preventDefault keeps this a
                // normal controlled input: cancelling the click leaves
                // React's value tracker believing the box already holds the
                // new value, so it never writes `checked` back and the box
                // you just clicked renders stale.
                onChange={(e) => {
                  const native = e.nativeEvent as Partial<MouseEvent>;
                  onToggleSelect(entry, native.shiftKey === true);
                }}
              />
            </label>
            <button type="button" className="tile-main" onClick={activate}>
              <span className="tile-preview">
                {entry.kind === "dir" ? (
                  <span className="tile-icon">📁</span>
                ) : hasThumb ? (
                  <>
                    <Thumb client={client} entry={entry} />
                    {isVideo(entry.name) && <span className="play-badge">▶</span>}
                  </>
                ) : (
                  <span className="tile-icon">
                    {isPdf(entry.name)
                      ? "📕"
                      : isAudio(entry.name)
                        ? "🎵"
                        : isText(entry.name)
                          ? "📝"
                          : "📄"}
                  </span>
                )}
              </span>
              <span className="tile-name" title={entry.name}>
                {entry.name}
              </span>
              {entry.kind === "file" && (
                <span className="tile-size">{humanSize(entry.size)}</span>
              )}
            </button>
            {entry.kind === "file" && (
              <div className="tile-actions">
                <a
                  className="tile-act"
                  href={client.fileUrl(entry.path)}
                  download
                  aria-label={`Download ${entry.name}`}
                >
                  ⭳
                </a>
                <button
                  type="button"
                  className="tile-act"
                  aria-label={`Rename ${entry.name}`}
                  onClick={() => {
                    onRename(entry);
                  }}
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="tile-act danger"
                  aria-label={`Delete ${entry.name}`}
                  onClick={() => {
                    onDelete(entry);
                  }}
                >
                  🗑
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
