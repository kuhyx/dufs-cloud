import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  append,
  clear,
  feed,
  fetchSegment,
  settled,
} from "./dash-buffer.ts";
import {
  THREE,
  asSourceBuffer,
  buffer,
  stream,
} from "../test/dash-buffer-fixtures.ts";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settled", () => {
  it("resolves on updateend", async () => {
    const b = buffer();
    const wait = settled(asSourceBuffer(b));
    b.dispatchEvent(new Event("updateend"));
    await expect(wait).resolves.toBeUndefined();
  });

  it("also resolves on error, so teardown cannot leave a dangling promise", async () => {
    const b = buffer();
    const wait = settled(asSourceBuffer(b));
    b.dispatchEvent(new Event("error"));
    await expect(wait).resolves.toBeUndefined();
  });
});

describe("append", () => {
  it("appends and waits for the operation to land", async () => {
    const b = buffer();
    await append(asSourceBuffer(b), new ArrayBuffer(4));
    expect(b.appended).toHaveLength(1);
  });

  it("returns quietly when the buffer has been detached", async () => {
    const b = buffer();
    b.throwOnAppend = new Error("detached");
    await expect(
      append(asSourceBuffer(b), new ArrayBuffer(4)),
    ).resolves.toBeUndefined();
    expect(b.appended).toHaveLength(0);
  });
});

describe("clear", () => {
  it("removes everything and waits", async () => {
    const b = buffer();
    await clear(asSourceBuffer(b));
    expect(b.removed).toBe(1);
  });

  it("returns quietly when removal throws", async () => {
    const b = buffer();
    b.throwOnAppend = new Error("detached");
    await expect(clear(asSourceBuffer(b))).resolves.toBeUndefined();
  });
});

describe("fetchSegment", () => {
  const signal = new AbortController().signal;

  it("returns the bytes on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
      ),
    );
    const data = await fetchSegment("/seg.m4s", signal);
    expect(data?.byteLength).toBe(8);
  });

  it("returns null past the end of a stream (404)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false })));
    expect(await fetchSegment("/seg.m4s", signal)).toBeNull();
  });

  it("returns null when the request is aborted or the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("abort"))));
    expect(await fetchSegment("/seg.m4s", signal)).toBeNull();
  });
});

describe("feed", () => {
  function stubOk(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)) }),
      ),
    );
  }

  it("appends the requested run of segments", async () => {
    stubOk();
    const b = buffer();
    const abort = new AbortController();
    await feed(asSourceBuffer(b), "/d", stream(THREE), 0, 2, abort.signal);
    expect(b.appended).toHaveLength(2);
  });

  it("stops at the end of the stream rather than fetching past it", async () => {
    stubOk();
    const b = buffer();
    const abort = new AbortController();
    await feed(asSourceBuffer(b), "/d", stream(THREE), 2, 5, abort.signal);
    expect(b.appended).toHaveLength(1);
  });

  it("stops immediately once aborted", async () => {
    stubOk();
    const b = buffer();
    const abort = new AbortController();
    abort.abort();
    await feed(asSourceBuffer(b), "/d", stream(THREE), 0, 3, abort.signal);
    expect(b.appended).toHaveLength(0);
  });

  it("skips a segment that is unavailable and continues", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        call += 1;
        return Promise.resolve(
          call === 1
            ? { ok: false }
            : { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)) },
        );
      }),
    );
    const b = buffer();
    const abort = new AbortController();
    await feed(asSourceBuffer(b), "/d", stream(THREE), 0, 2, abort.signal);
    expect(b.appended).toHaveLength(1);
  });
});
