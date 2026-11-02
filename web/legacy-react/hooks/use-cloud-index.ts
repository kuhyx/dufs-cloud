import { useCallback, useEffect, useRef, useState } from "react";
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

export interface CloudIndex {
  /** Every file and folder in the cloud (minus skipped names), flat. */
  readonly entries: readonly DirEntry[];
  readonly loading: boolean;
  /** True once a walk has completed for the current generation. */
  readonly ready: boolean;
  readonly error: string | null;
  /** Live counts of the walk in flight (final counts once it has finished). */
  readonly progress: IndexProgress;
  /** True when the walk was cancelled: `entries` holds only what was found. */
  readonly partial: boolean;
  /** Stop the walk in flight, keeping what it has found so far. */
  readonly cancel: () => void;
  /** Invalidate the cache so the next enabled render re-walks (after mutations). */
  readonly reload: () => void;
}

interface Loaded {
  readonly gen: number;
  readonly entries: DirEntry[];
  readonly error: string | null;
  readonly partial: boolean;
}

/**
 * Lazily build and cache a whole-cloud index. The walk only runs once `enabled`
 * is true (the gallery flips it on when the filter bar is first used), so plain
 * browsing pays nothing. `reload()` bumps a generation counter to invalidate the
 * cache after an upload/move/delete. Loading is derived (no synchronous setState
 * in the effect) from whether the last completed walk matches the current
 * generation. `cancel()` ends a walk early and keeps its partial result.
 */
export function useCloudIndex(client: DufsClient, enabled: boolean): CloudIndex {
  const [loaded, setLoaded] = useState<Loaded>({
    gen: -1,
    entries: [],
    error: null,
    partial: false,
  });
  const [live, setLive] = useState<{ gen: number; p: IndexProgress }>({
    gen: -1,
    p: NO_PROGRESS,
  });
  const [gen, setGen] = useState(0);
  const stopRef = useRef<() => void>(() => undefined);
  const reload = useCallback(() => {
    setGen((g) => g + 1);
  }, []);
  const cancel = useCallback(() => {
    stopRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let unmounted = false;
    let stopped = false;
    stopRef.current = () => {
      stopped = true;
    };
    const ctl: WalkControl = {
      stopped: () => unmounted || stopped,
      onProgress: (p) => {
        if (!unmounted) setLive({ gen, p });
      },
    };
    void collectTree(client, ctl).then((result) => {
      if (unmounted) return;
      setLoaded({ gen, entries: result.entries, error: result.error, partial: stopped });
    });
    return () => {
      unmounted = true;
    };
  }, [client, enabled, gen]);

  const ready = loaded.gen === gen;
  return {
    entries: ready ? loaded.entries : [],
    loading: enabled && !ready,
    ready,
    error: ready ? loaded.error : null,
    progress: live.gen === gen ? live.p : NO_PROGRESS,
    partial: ready && loaded.partial,
    cancel,
    reload,
  };
}
