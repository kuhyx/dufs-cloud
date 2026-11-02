import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSubtitleManifest } from "./use-subtitle-manifest.ts";
import type { DufsClient } from "../api/dufs-client.ts";
import type { SubtitleManifest } from "../api/types.ts";

const manifest: SubtitleManifest = {
  generatedMs: 0,
  fonts: [],
  tracks: [],
};

function makeClient(
  fetchSubtitleManifest: (dir: string) => Promise<SubtitleManifest | null>,
): DufsClient {
  return {
    list: vi.fn(),
    fileUrl: (p: string) => p,
    thumbUrl: (p: string) => p,
    zipUrl: (p: string) => p,
    upload: vi.fn(),
    remove: vi.fn(),
    createDir: vi.fn(),
    move: vi.fn(),
    rename: vi.fn(),
    readText: vi.fn(),
    writeText: vi.fn(),
    fetchMeta: vi.fn(() => Promise.resolve({})),
    fetchSubtitleManifest: vi.fn(fetchSubtitleManifest),
    downloadBytes: vi.fn(),
  };
}

describe("useSubtitleManifest", () => {
  it("fetches nothing when the video has no subtitles directory", () => {
    const client = makeClient(() => Promise.resolve(manifest));
    const { result } = renderHook(() => useSubtitleManifest(client, null));
    expect(result.current).toBeNull();
    expect(client.fetchSubtitleManifest).not.toHaveBeenCalled();
  });

  it("adopts the fetched manifest", async () => {
    const client = makeClient(() => Promise.resolve(manifest));
    const { result } = renderHook(() =>
      useSubtitleManifest(client, "/.subs/a.mkv"),
    );
    await waitFor(() => {
      expect(result.current).toEqual(manifest);
    });
    expect(client.fetchSubtitleManifest).toHaveBeenCalledWith("/.subs/a.mkv");
  });

  it("stays null when the manifest is absent", async () => {
    const client = makeClient(() => Promise.resolve(null));
    const { result } = renderHook(() =>
      useSubtitleManifest(client, "/.subs/a.mkv"),
    );
    await waitFor(() => {
      expect(client.fetchSubtitleManifest).toHaveBeenCalled();
    });
    expect(result.current).toBeNull();
  });

  it("clears the manifest when the viewer moves to a video without one", async () => {
    const client = makeClient(() => Promise.resolve(manifest));
    const initialProps: { dir: string | null } = { dir: "/.subs/a.mkv" };
    const { result, rerender } = renderHook(
      ({ dir }: { dir: string | null }) => useSubtitleManifest(client, dir),
      { initialProps },
    );
    await waitFor(() => {
      expect(result.current).toEqual(manifest);
    });
    rerender({ dir: null });
    expect(result.current).toBeNull();
  });

  it("ignores a slow response for a video the user already left", async () => {
    let release: ((m: SubtitleManifest) => void) | undefined;
    const client = makeClient(
      () =>
        new Promise<SubtitleManifest | null>((resolve) => {
          release = resolve;
        }),
    );
    const { result, unmount } = renderHook(() =>
      useSubtitleManifest(client, "/.subs/a.mkv"),
    );
    unmount();
    release?.(manifest);
    await Promise.resolve();
    expect(result.current).toBeNull();
  });
});
