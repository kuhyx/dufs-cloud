import { useCallback, useEffect, useState } from "react";
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

/** Depth-first descent collecting every non-skipped entry under `dir`. A single
 * folder's failed PROPFIND is skipped so one bad folder can't abort the index. */
async function walkInto(
  client: DufsClient,
  dir: string,
  acc: DirEntry[],
  cancelled: () => boolean,
): Promise<void> {
  if (cancelled()) return;
  let entries: readonly DirEntry[];
  try {
    entries = await client.list(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    acc.push(entry);
    if (entry.kind === "dir") await walkInto(client, entry.path, acc, cancelled);
  }
}

/** Walk the whole cloud from the root. Only a root-level failure surfaces as an
 * error (there is nothing to show); deeper failures are skipped in `walkInto`. */
async function collectTree(
  client: DufsClient,
  cancelled: () => boolean,
): Promise<{ entries: DirEntry[]; error: string | null }> {
  const acc: DirEntry[] = [];
  let roots: readonly DirEntry[];
  try {
    roots = await client.list("/");
  } catch (err: unknown) {
    return { entries: acc, error: err instanceof Error ? err.message : String(err) };
  }
  for (const entry of roots) {
    if (SKIP.has(entry.name)) continue;
    acc.push(entry);
    if (entry.kind === "dir") await walkInto(client, entry.path, acc, cancelled);
  }
  return { entries: acc, error: null };
}

export interface CloudIndex {
  /** Every file and folder in the cloud (minus skipped names), flat. */
  readonly entries: readonly DirEntry[];
  readonly loading: boolean;
  /** True once a walk has completed for the current generation. */
  readonly ready: boolean;
  readonly error: string | null;
  /** Invalidate the cache so the next enabled render re-walks (after mutations). */
  readonly reload: () => void;
}

/**
 * Lazily build and cache a whole-cloud index. The walk only runs once `enabled`
 * is true (the gallery flips it on when the filter bar is first used), so plain
 * browsing pays nothing. `reload()` bumps a generation counter to invalidate the
 * cache after an upload/move/delete. Loading is derived (no synchronous setState
 * in the effect) from whether the last completed walk matches the current
 * generation.
 */
export function useCloudIndex(client: DufsClient, enabled: boolean): CloudIndex {
  const [loaded, setLoaded] = useState<{
    gen: number;
    entries: DirEntry[];
    error: string | null;
  }>({ gen: -1, entries: [], error: null });
  const [gen, setGen] = useState(0);
  const reload = useCallback(() => {
    setGen((g) => g + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void collectTree(client, () => cancelled).then((result) => {
      if (cancelled) return;
      setLoaded({ gen, entries: result.entries, error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, gen]);

  const ready = loaded.gen === gen;
  return {
    entries: ready ? loaded.entries : [],
    loading: enabled && !ready,
    ready,
    error: ready ? loaded.error : null,
    reload,
  };
}
