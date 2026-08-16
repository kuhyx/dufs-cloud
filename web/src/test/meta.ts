import type { MediaMeta } from "../api/types.ts";

/** Build a {@link MediaMeta} with every field defaulted to null.
 *
 * Tests care about one or two fields at a time, so spelling out all of them at
 * each call site meant every new field broke every existing test. Override only
 * what the test is actually about. */
export function meta(over: Partial<MediaMeta> = {}): MediaMeta {
  return {
    width: null,
    height: null,
    durationMs: null,
    createdMs: null,
    uploadedMs: null,
    proxyPath: null,
    dashPath: null,
    appProxyPath: null,
    subtitlesPath: null,
    ...over,
  };
}
