import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import type { FolderGroup } from "../lib/cloud-stats.ts";
import { Grid } from "./grid.tsx";

interface ResultGroupsProps {
  readonly client: DufsClient;
  readonly groups: readonly FolderGroup[];
  readonly collapsed: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  readonly onToggleCollapsed: (folder: string) => void;
  readonly onToggleSelect: (entry: DirEntry, shiftKey: boolean) => void;
  readonly onOpenDir: (path: string) => void;
  readonly onOpenMedia: (entry: DirEntry) => void;
  readonly onEditText: (entry: DirEntry) => void;
  readonly onDelete: (entry: DirEntry) => void;
  readonly onRename: (entry: DirEntry) => void;
}

/** Global (whole-cloud) search results, one collapsible grid per folder. */
export function ResultGroups({
  client,
  groups,
  collapsed,
  selected,
  onToggleCollapsed,
  onToggleSelect,
  onOpenDir,
  onOpenMedia,
  onEditText,
  onDelete,
  onRename,
}: ResultGroupsProps): React.JSX.Element {
  return (
    <>
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.folder);
        return (
          <section key={group.folder} className="result-group">
            <div className="group-head">
              <button
                type="button"
                className="group-toggle"
                aria-label={
                  isCollapsed ? `Expand ${group.folder}` : `Collapse ${group.folder}`
                }
                aria-expanded={!isCollapsed}
                onClick={() => {
                  onToggleCollapsed(group.folder);
                }}
              >
                {isCollapsed ? "▸" : "▾"}
              </button>
              <button
                type="button"
                className="group-path"
                onClick={() => {
                  onOpenDir(group.folder);
                }}
              >
                📁 {group.folder}
              </button>
              <span className="group-count muted">{group.entries.length}</span>
            </div>
            {!isCollapsed && (
              <Grid
                client={client}
                entries={group.entries}
                selected={selected}
                onToggleSelect={onToggleSelect}
                onOpenDir={onOpenDir}
                onOpenMedia={onOpenMedia}
                onEditText={onEditText}
                onDelete={onDelete}
                onRename={onRename}
              />
            )}
          </section>
        );
      })}
    </>
  );
}
