import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMeta } from "./use-meta.ts";
import type { DufsClient } from "../api/dufs-client.ts";
import type { MetaIndex } from "../api/types.ts";
import { meta as makeMeta } from "../test/meta.ts";

function makeClient(fetchMeta: () => Promise<MetaIndex>): DufsClient {
  return {
    list: vi.fn(),
    fileUrl: (p: string) => p,
    thumbUrl: (p: string) => p,
    zipUrl: (p: string) => `${p}?zip`,
    upload: vi.fn(),
    remove: vi.fn(),
    createDir: vi.fn(),
    move: vi.fn(),
    rename: vi.fn(),
    readText: vi.fn(),
    writeText: vi.fn(),
    fetchMeta: vi.fn(fetchMeta),
    fetchSubtitleManifest: vi.fn(() => Promise.resolve(null)),
    downloadBytes: vi.fn(() => Promise.resolve(new Uint8Array())),
  };
}

describe("useMeta", () => {
  it("starts empty and adopts the fetched index", async () => {
    const index: MetaIndex = {
      "/a.mp4": makeMeta({ durationMs: 1000 }),
    };
    const { result } = renderHook(() =>
      useMeta(makeClient(() => Promise.resolve(index))),
    );
    expect(result.current).toEqual({});
    await waitFor(() => {
      expect(result.current).toEqual(index);
    });
  });

  it("ignores a resolution that arrives after unmount", async () => {
    let resolve!: (m: MetaIndex) => void;
    const pending = new Promise<MetaIndex>((r) => {
      resolve = r;
    });
    const { result, unmount } = renderHook(() =>
      useMeta(makeClient(() => pending)),
    );
    unmount();
    resolve({});
    await pending;
    // No state update after unmount → still the initial value, no React warning.
    expect(result.current).toEqual({});
  });
});
