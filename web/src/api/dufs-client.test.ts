import { describe, it, expect, vi } from "vitest";
import { createDufsClient } from "./dufs-client.ts";
import { PROPFIND_XML } from "../test/propfind-fixture.ts";

function jsonResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("createDufsClient", () => {
  it("list() PROPFINDs, sorts, and returns entries", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(PROPFIND_XML)),
    );
    const client = createDufsClient(fetchImpl);
    const entries = await client.list("/Media/2026/07");
    const firstCall = fetchImpl.mock.calls.at(0);
    expect(firstCall?.[0]).toBe("/Media/2026/07");
    expect(firstCall?.[1]?.method).toBe("PROPFIND");
    expect(entries.length).toBe(2);
  });

  it("builds file and thumbnail URLs (encoded)", () => {
    const client = createDufsClient(vi.fn<typeof fetch>());
    expect(client.fileUrl("/Media/a b.jpg")).toBe("/Media/a%20b.jpg");
    expect(client.thumbUrl("/Media/a b.jpg")).toBe(
      "/.thumbs/Media/a%20b.jpg.jpg",
    );
  });

  it("remove DELETEs, writeText PUTs, readText GETs", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse("content")),
    );
    const client = createDufsClient(fetchImpl);
    await client.remove("/dir/n.txt");
    await client.writeText("/dir/n.txt", "hi");
    const text = await client.readText("/dir/n.txt");
    expect(text).toBe("content");
    const methods = fetchImpl.mock.calls.map((c) => c[1]?.method);
    expect(methods).toEqual(["DELETE", "PUT", "GET"]);
    expect(fetchImpl.mock.calls.at(0)?.[0]).toBe("/dir/n.txt");
  });

  describe("upload (XHR, for upload progress events)", () => {
    // A hand-rolled XHR: the test decides which events fire and when.
    interface FakeXhr {
      status: number;
      withCredentials: boolean;
      opened: string[];
      sent: unknown;
      aborted: boolean;
      upload: { onprogress: ((e: { loaded: number }) => void) | null };
      onload: (() => void) | null;
      onerror: (() => void) | null;
      onabort: (() => void) | null;
      open(method: string, url: string): void;
      send(body: unknown): void;
      abort(): void;
    }
    function fakeXhr(): FakeXhr {
      return {
        status: 0,
        withCredentials: false,
        opened: [],
        sent: null,
        aborted: false,
        upload: { onprogress: null },
        onload: null,
        onerror: null,
        onabort: null,
        open(method, url) {
          this.opened.push(`${method} ${url}`);
        },
        send(body) {
          this.sent = body;
        },
        abort() {
          this.aborted = true;
          this.onabort?.();
        },
      };
    }
    function clientWith(xhr: FakeXhr) {
      return createDufsClient(
        vi.fn<typeof fetch>(),
        () => xhr as unknown as XMLHttpRequest,
      );
    }

    it("PUTs the file with credentials and reports upload progress", async () => {
      const xhr = fakeXhr();
      const client = clientWith(xhr);
      const file = new File(["xyz"], "n.txt");
      const seen: number[] = [];
      const done = client.upload("/dir", file, { onProgress: (n) => seen.push(n) });
      expect(xhr.opened).toEqual(["PUT /dir/n.txt"]);
      expect(xhr.withCredentials).toBe(true);
      expect(xhr.sent).toBe(file);
      xhr.upload.onprogress?.({ loaded: 1 });
      xhr.upload.onprogress?.({ loaded: 3 });
      xhr.status = 201;
      xhr.onload?.();
      await done;
      expect(seen).toEqual([1, 3]);
    });

    it("uses the page's XMLHttpRequest by default", async () => {
      const made: FakeXhr[] = [];
      // `new` needs a real constructor; a plain function serves as one.
      function StubXhr(this: unknown): FakeXhr {
        const xhr = fakeXhr();
        made.push(xhr);
        return xhr;
      }
      vi.stubGlobal("XMLHttpRequest", StubXhr);
      try {
        const client = createDufsClient(vi.fn<typeof fetch>());
        const done = client.upload("/d", new File([""], "a"));
        const xhr = made.at(0);
        if (xhr === undefined) throw new Error("no XHR constructed");
        xhr.status = 201;
        xhr.onload?.();
        await done;
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("rejects on an error status, a network error, and an abort", async () => {
      const bad = fakeXhr();
      const p1 = clientWith(bad).upload("/d", new File([""], "a"));
      bad.status = 500;
      bad.onload?.();
      await expect(p1).rejects.toThrow("PUT /d/a → 500");

      const net = fakeXhr();
      const p2 = clientWith(net).upload("/d", new File([""], "b"));
      net.onerror?.();
      await expect(p2).rejects.toThrow("network error");

      const controller = new AbortController();
      const cancelled = fakeXhr();
      const p3 = clientWith(cancelled).upload("/d", new File([""], "c"), {
        signal: controller.signal,
      });
      controller.abort();
      expect(cancelled.aborted).toBe(true);
      await expect(p3).rejects.toMatchObject({ name: "AbortError" });
    });
  });

  it("throws on non-ok responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse("", false, 404)),
    );
    const client = createDufsClient(fetchImpl);
    await expect(client.remove("/nope")).rejects.toThrow("404");
  });

  it("move MOVEs into the destination dir, keeping the base name", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse("")),
    );
    const client = createDufsClient(fetchImpl);
    await client.move("/a/pic.jpg", "/b");
    const call = fetchImpl.mock.calls.at(0);
    expect(call?.[0]).toBe("/a/pic.jpg");
    expect(call?.[1]?.method).toBe("MOVE");
    const headers = call?.[1]?.headers as Record<string, string>;
    expect(headers.Destination).toBe("/b/pic.jpg");
    expect(headers.Overwrite).toBe("F");
  });

  it("rename MOVEs to a new name in the same directory", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse("")),
    );
    const client = createDufsClient(fetchImpl);
    await client.rename("/a/old.jpg", "new.jpg");
    const call = fetchImpl.mock.calls.at(0);
    expect(call?.[0]).toBe("/a/old.jpg");
    expect(call?.[1]?.method).toBe("MOVE");
    const headers = call?.[1]?.headers as Record<string, string>;
    expect(headers.Destination).toBe("/a/new.jpg");
  });
});
