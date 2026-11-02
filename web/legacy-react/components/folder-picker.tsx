import { useEffect, useState } from "react";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { parentPath } from "../lib/paths.ts";

interface FolderPickerProps {
  readonly client: DufsClient;
  /** Where browsing starts (usually the folder being moved out of). */
  readonly initialPath: string;
  /** How many items are being moved — shown in the heading. */
  readonly count: number;
  readonly onPick: (destDir: string) => void;
  readonly onCancel: () => void;
}

interface Loaded {
  /** Which directory these results describe (drives the derived `loading`). */
  readonly dir: string;
  readonly folders: readonly DirEntry[];
  readonly error: string | null;
}

/**
 * A modal folder browser for choosing a move destination. It lists only
 * directories (files are irrelevant to a move target), lets the user descend
 * into subfolders or step up, and reports the folder they land on via `onPick`.
 * Reuses {@link DufsClient.list}, so no new server surface is needed.
 */
export function FolderPicker({
  client,
  initialPath,
  count,
  onPick,
  onCancel,
}: FolderPickerProps): React.JSX.Element {
  const [dir, setDir] = useState(initialPath);
  // Loading is derived (no synchronous setState in the effect): we are loading
  // whenever the last completed load is for a different dir than the current.
  const [loaded, setLoaded] = useState<Loaded>({
    dir: "",
    folders: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    // One settle handler → a single `cancelled` guard to reason about.
    void client
      .list(dir)
      .then(
        (all): Omit<Loaded, "dir"> => ({
          folders: all.filter((e) => e.kind === "dir"),
          error: null,
        }),
        (err: unknown): Omit<Loaded, "dir"> => ({
          folders: [],
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      .then((result) => {
        if (cancelled) return;
        setLoaded({ dir, ...result });
      });
    return () => {
      cancelled = true;
    };
  }, [client, dir]);

  const loading = loaded.dir !== dir;

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div
        className="dialog"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <p>
          Move {count} item{count === 1 ? "" : "s"} to:
        </p>
        <p className="picker-path muted">{dir}</p>
        <ul className="picker-list">
          {dir !== "/" && (
            <li>
              <button
                type="button"
                className="picker-row"
                onClick={() => {
                  setDir(parentPath(dir));
                }}
              >
                📁 ..
              </button>
            </li>
          )}
          {loading && <li className="muted">Loading…</li>}
          {!loading && loaded.error !== null && (
            <li className="error">Could not load: {loaded.error}</li>
          )}
          {!loading &&
            loaded.error === null &&
            loaded.folders.length === 0 && (
              <li className="muted">No subfolders.</li>
            )}
          {loaded.folders.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                className="picker-row"
                onClick={() => {
                  setDir(f.path);
                }}
              >
                📁 {f.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onPick(dir);
            }}
          >
            Move here
          </button>
        </div>
      </div>
    </div>
  );
}
