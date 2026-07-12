import { useEffect, useState } from "react";
import type { DufsClient } from "../api/dufs-client.ts";
import type { MetaIndex } from "../api/types.ts";

/**
 * Fetch the server metadata index once for the whole session.
 *
 * The index (`/.meta/index.json`) is a single global file — unlike the
 * per-directory PROPFIND listing — so it is fetched once on mount rather than
 * on every navigation. Callers receive `{}` until the fetch resolves; every
 * consumer ({@link applyFilterSort}) already tolerates a missing entry, so the
 * grid renders immediately on mtime and refines when the index arrives.
 */
export function useMeta(client: DufsClient): MetaIndex {
  const [meta, setMeta] = useState<MetaIndex>({});
  useEffect(() => {
    let cancelled = false;
    // fetchMeta resolves to {} on any failure, so there is no reject branch.
    void client.fetchMeta().then((m) => {
      if (!cancelled) setMeta(m);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);
  return meta;
}
