import { describe, it, expect, vi } from "vitest";
import { createDufsClient } from "./dufs-client.ts";

function okResponse(init: Partial<Response> & { ok?: boolean }): Response {
  return { ok: true, status: 200, ...init } as unknown as Response;
}

describe("dufs-client operations", () => {
  it("zipUrl encodes and appends ?zip", () => {
    const client = createDufsClient(vi.fn<typeof fetch>());
    expect(client.zipUrl("/Media/a b")).toBe("/Media/a%20b?zip");
  });

  it("createDir issues MKCOL", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(okResponse({ status: 201 })),
    );
    const client = createDufsClient(fetchImpl);
    await client.createDir("/new dir");
    const call = fetchImpl.mock.calls.at(0);
    expect(call?.[0]).toBe("/new%20dir");
    expect(call?.[1]?.method).toBe("MKCOL");
  });

  it("move issues MOVE with an encoded Destination and Overwrite:F", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(okResponse({ status: 204 })),
    );
    const client = createDufsClient(fetchImpl);
    await client.move("/dir/a b.jpg", "/dest");
    const call = fetchImpl.mock.calls.at(0);
    expect(call?.[0]).toBe("/dir/a%20b.jpg");
    expect(call?.[1]?.method).toBe("MOVE");
    const headers = call?.[1]?.headers as Record<string, string>;
    expect(headers.Destination).toBe("/dest/a%20b.jpg");
    expect(headers.Overwrite).toBe("F");
  });

  it("downloadBytes returns the response bytes", async () => {
    const buf = new Uint8Array([7, 8, 9]).buffer;
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        okResponse({ arrayBuffer: () => Promise.resolve(buf) }),
      ),
    );
    const client = createDufsClient(fetchImpl);
    expect(await client.downloadBytes("/f.bin")).toEqual(
      new Uint8Array([7, 8, 9]),
    );
  });

  describe("fetchMeta", () => {
    const entry = {
      width: 10,
      height: 20,
      durationMs: null,
      createdMs: 1,
      uploadedMs: 2,
    };

    it("returns entries from a valid index", async () => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          okResponse({
            json: () => Promise.resolve({ entries: { "/a.jpg": entry } }),
          }),
        ),
      );
      const meta = await createDufsClient(fetchImpl).fetchMeta();
      expect(meta["/a.jpg"]).toEqual(entry);
    });

    it("returns {} when the index is missing (non-ok)", async () => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.resolve(okResponse({ ok: false, status: 404 })),
      );
      expect(await createDufsClient(fetchImpl).fetchMeta()).toEqual({});
    });

    it("returns {} for malformed index shapes", async () => {
      const shapes: unknown[] = [
        [1, 2],
        null,
        { entries: null },
        { entries: 5 },
      ];
      for (const shape of shapes) {
        const fetchImpl = vi.fn<typeof fetch>(() =>
          Promise.resolve(okResponse({ json: () => Promise.resolve(shape) })),
        );
        expect(await createDufsClient(fetchImpl).fetchMeta()).toEqual({});
      }
    });

    it("returns {} when JSON parsing throws", async () => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          okResponse({ json: () => Promise.reject(new Error("bad")) }),
        ),
      );
      expect(await createDufsClient(fetchImpl).fetchMeta()).toEqual({});
    });

    it("returns {} when the network fetch itself rejects (offline)", async () => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.reject(new Error("offline")),
      );
      expect(await createDufsClient(fetchImpl).fetchMeta()).toEqual({});
    });
  });

  describe("fetchSubtitleManifest", () => {
    const manifest = { generatedMs: 1, fonts: ["a.ttf"], tracks: [] };

    it("reads tracks.json from the video's subtitles directory", async () => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          okResponse({ json: () => Promise.resolve(manifest) }),
        ),
      );
      const got =
        await createDufsClient(fetchImpl).fetchSubtitleManifest("/.subs/a b");
      expect(got).toEqual(manifest);
      expect(fetchImpl.mock.calls.at(0)?.at(0)).toBe(
        "/.subs/a%20b/tracks.json",
      );
    });

    it("returns null when the manifest is missing (non-ok)", async () => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.resolve(okResponse({ ok: false, status: 404 })),
      );
      expect(
        await createDufsClient(fetchImpl).fetchSubtitleManifest("/.subs/a"),
      ).toBeNull();
    });

    it("returns null for malformed manifest shapes", async () => {
      const shapes: unknown[] = [
        null,
        5,
        {},
        { tracks: [] },
        { fonts: [] },
        { tracks: "no", fonts: [] },
        { tracks: [], fonts: "no" },
      ];
      for (const shape of shapes) {
        const fetchImpl = vi.fn<typeof fetch>(() =>
          Promise.resolve(okResponse({ json: () => Promise.resolve(shape) })),
        );
        expect(
          await createDufsClient(fetchImpl).fetchSubtitleManifest("/.subs/a"),
        ).toBeNull();
      }
    });

    it("returns null when JSON parsing throws", async () => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          okResponse({ json: () => Promise.reject(new Error("bad")) }),
        ),
      );
      expect(
        await createDufsClient(fetchImpl).fetchSubtitleManifest("/.subs/a"),
      ).toBeNull();
    });

    it("returns null when the network fetch itself rejects (offline)", async () => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.reject(new Error("offline")),
      );
      expect(
        await createDufsClient(fetchImpl).fetchSubtitleManifest("/.subs/a"),
      ).toBeNull();
    });
  });
});
