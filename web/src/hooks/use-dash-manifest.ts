import { useEffect, useState } from "react";
import {
  audioStreams,
  parseDashManifest,
  type DashManifest,
  type DashStream,
} from "../lib/dash-manifest.ts";
import { fetchSegment } from "../lib/dash-buffer.ts";

/** The audio stream with `id`, or null. */
export function audioTrack(
  manifest: DashManifest | null,
  id: string | null,
): DashStream | null {
  if (manifest === null || id === null) return null;
  return audioStreams(manifest).find((s) => s.id === id) ?? null;
}

/** Fetches and parses the manifest for `dir`, or null when there is none.
 *
 * Keyed by the directory it was fetched for, so a stale manifest is never
 * returned for the next video: switching videos changes the key and the result
 * is discarded until the new fetch lands. Deriving this rather than clearing it
 * in an effect avoids a cascading render. */
export function useManifest(dir: string | null): DashManifest | null {
  const [fetched, setFetched] = useState<{
    dir: string;
    manifest: DashManifest | null;
  } | null>(null);

  useEffect(() => {
    if (dir === null) return undefined;
    const abort = new AbortController();
    void (async () => {
      const data = await fetchSegment(`${dir}/manifest.mpd`, abort.signal);
      if (abort.signal.aborted) return;
      const parsed =
        data === null
          ? null
          : parseDashManifest(new TextDecoder().decode(data));
      setFetched({ dir, manifest: parsed });
    })();
    return () => {
      abort.abort();
    };
  }, [dir]);

  return fetched !== null && fetched.dir === dir ? fetched.manifest : null;
}
