import { createStore, type Readable } from "./store.ts";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

/**
 * Names never included in the whole-cloud index. The app shell (index.html,
 * assets, thumbnails) is not user content, and `.thumbs`/`.proxies` in
 * particular are full mirrors of the media tree — descending into them would
 * double the walk and flood results with a thumbnail/proxy per video.
 * `Keepass` holds the KeePass database and its sync metadata: sensitive and
 * noise in a media filter.
 */
const SKIP = new Set([
  "index.html",
  "assets",
  "favicon.ico",
  "vite.svg",
  ".thumbs",
  "_thumbs",
  ".meta",
  ".proxies",
  "Keepass",
]);

/** Live counters of a walk in flight: folders listed, entries found so far, and
 * the folder most recently listed. All three are true counts, never estimates. */
export interface IndexProgress {
  readonly folders: number;
  readonly entries: number;
  readonly path: string;
}

const NO_PROGRESS: IndexProgress = { folders: 0, entries: 0, path: "" };

/** Hooks the walk reports through; `stopped` is polled between folders. */
interface WalkControl {
  readonly stopped: () => boolean;
  readonly onProgress: (p: IndexProgress) => void;
}

/** Shared state of one walk: the accumulating entries plus the live counters. */
interface Walk {
  readonly acc: DirEntry[];
  readonly ctl: WalkControl;
  folders: number;
  /** Entries found: counted when their listing arrives, so it only grows. */
  found: number;
  last: string;
}

/** Record `dir`'s listing (in order, descending into each folder right after
 * it is added) and publish the counters. Skip-named entries are never entered. */
async function visit(
  client: DufsClient,
  walk: Walk,
  dir: string,
  entries: readonly DirEntry[],
): Promise<void> {
  walk.folders += 1;
  walk.found += entries.filter((e) => !SKIP.has(e.name)).length;
  walk.last = dir;
  walk.ctl.onProgress({ folders: walk.folders, entries: walk.found, path: dir });
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    walk.acc.push(entry);
    if (entry.kind === "dir") await walkInto(client, walk, entry.path);
  }
}

/** Depth-first descent collecting every non-skipped entry under `dir`. A single
 * folder's failed PROPFIND is skipped so one bad folder can't abort the index. */
async function walkInto(client: DufsClient, walk: Walk, dir: string): Promise<void> {
  if (walk.ctl.stopped()) return;
  let entries: readonly DirEntry[];
  try {
    entries = await client.list(dir);
  } catch {
    return;
  }
  await visit(client, walk, dir, entries);
}

/** Walk the whole cloud from the root. Only a root-level failure surfaces as an
 * error (there is nothing to show); deeper failures are skipped in `walkInto`. */
async function collectTree(
  client: DufsClient,
  ctl: WalkControl,
): Promise<{ entries: DirEntry[]; error: string | null }> {
  const walk: Walk = { acc: [], ctl, folders: 0, found: 0, last: "" };
  let roots: readonly DirEntry[];
  try {
    roots = await client.list("/");
  } catch (err: unknown) {
    return { entries: walk.acc, error: err instanceof Error ? err.message : String(err) };
  }
  await visit(client, walk, "/", roots);
  return { entries: walk.acc, error: null };
}

export interface CloudIndexState {
  /** Every file and folder in the cloud (minus skipped names), flat. */
  readonly entries: readonly DirEntry[];
  readonly loading: boolean;
  /** True once the walk has completed. */
  readonly ready: boolean;
  readonly error: string | null;
  /** Live counts of the walk in flight (final counts once it has finished). */
  readonly progress: IndexProgress;
  /** True when the walk was cancelled: `entries` holds only what was found. */
  readonly partial: boolean;
}

export interface CloudIndex extends Readable<CloudIndexState> {
  /** Start the first walk; idempotent. Plain browsing pays nothing until then. */
  enable: () => void;
  /** Stop the walk in flight, keeping what it has found so far. */
  cancel: () => void;
  /** Re-walk after a mutation (no-op until enabled). */
  reload: () => void;
  dispose: () => void;
}

interface Run {
  dead: boolean;
  stopped: boolean;
}

const IDLE: CloudIndexState = {
  entries: [],
  loading: false,
  ready: false,
  error: null,
  progress: NO_PROGRESS,
  partial: false,
};

/** Lazily builds and caches a whole-cloud index of `client`. */
export function createCloudIndex(client: DufsClient): CloudIndex {
  const store = createStore<CloudIndexState>(IDLE);
  let enabled = false;
  let run: Run | null = null;

  const kill = (): void => {
    if (run !== null) run.dead = true;
  };

  const walk = (): void => {
    kill();
    const mine: Run = { dead: false, stopped: false };
    run = mine;
    store.setState({ ...IDLE, loading: true });
    const ctl: WalkControl = {
      stopped: () => mine.dead || mine.stopped,
      onProgress: (progress) => {
        if (!mine.dead) store.setState((s) => ({ ...s, progress }));
      },
    };
    void collectTree(client, ctl).then((result) => {
      if (mine.dead) return;
      store.setState((s) => ({
        entries: result.entries,
        loading: false,
        ready: true,
        error: result.error,
        progress: s.progress,
        partial: mine.stopped,
      }));
    });
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    enable: () => {
      if (enabled) return;
      enabled = true;
      walk();
    },
    cancel: () => {
      if (run !== null) run.stopped = true;
    },
    reload: () => {
      if (enabled) walk();
    },
    dispose: kill,
  };
}
