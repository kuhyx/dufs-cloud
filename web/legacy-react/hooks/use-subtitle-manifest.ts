import { useEffect, useState } from "react";
import type { DufsClient } from "../api/dufs-client.ts";
import type { SubtitleManifest } from "../api/types.ts";

/** Fetches the subtitle manifest for the video currently open in the viewer.
 *
 * Per-video rather than up-front: the library holds ~1000 files and only the
 * one being watched needs its track list. `dir` is the video's `subtitlesPath`
 * from the metadata index, or null when it has no extracted subtitles. */
export function useSubtitleManifest(
  client: DufsClient,
  dir: string | null,
): SubtitleManifest | null {
  // Keyed by the directory it was fetched for, so a stale manifest is never
  // returned for the next video: switching videos changes the key, and the
  // result below is discarded until the new fetch lands. Deriving this rather
  // than clearing it in an effect avoids a cascading render.
  const [fetched, setFetched] = useState<{
    dir: string;
    manifest: SubtitleManifest | null;
  } | null>(null);

  useEffect(() => {
    if (dir === null) return undefined;
    // Guards against a slow fetch for a previous video landing after the user
    // has already moved on to the next one.
    let live = true;
    void client.fetchSubtitleManifest(dir).then((m) => {
      if (live) setFetched({ dir, manifest: m });
    });
    return () => {
      live = false;
    };
  }, [client, dir]);

  return fetched !== null && fetched.dir === dir ? fetched.manifest : null;
}
