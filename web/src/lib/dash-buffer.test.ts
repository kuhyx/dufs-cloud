import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  append,
  bufferedAhead,
  clear,
  feed,
  fetchSegment,
  isBuffered,
  nextSegment,
  settled,
} from "./dash-buffer.ts";
import type { DashSegment, DashStream } from "./dash-manifest.ts";

/** A SourceBuffer stand-in: jsdom has no MSE, and the behaviour that matters
 * here is the event protocol (append/remove complete asynchronously via
 * `updateend`, or fail via `error`), not real demuxing. */
class FakeBuffer extends EventTarget {
  updating = false;
  appended: ArrayBuffer[] = [];
  removed = 0;
  /** When set, the next appendBuffer throws it, as a detached buffer does. */
  throwOnAppend: Error | null = null;
  /** When true, operations dispatch "error" instead of "updateend". */
  failing = false;
  ranges: { start: number; end: number }[] = [];

  get buffered() {
    const ranges = this.ranges;
    return {
      length: ranges.length,
      start: (i: number) => ranges[i]?.start ?? 0,
      end: (i: number) => ranges[i]?.end ?? 0,
    };
  }

  private finish(): void {
    queueMicrotask(() => {
      this.dispatchEvent(new Event(this.failing ? "error" : "updateend"));
    });
  }

  appendBuffer(data: ArrayBuffer): void {
    if (this.throwOnAppend !== null) throw this.throwOnAppend;
    this.appended.push(data);
    this.finish();
  }

  remove(): void {
    if (this.throwOnAppend !== null) throw this.throwOnAppend;
    this.removed += 1;
    this.finish();
  }
}

function buffer(): FakeBuffer {
  return new FakeBuffer();
}

function asSourceBuffer(b: FakeBuffer): SourceBuffer {
  return b as unknown as SourceBuffer;
}

function stream(segments: DashSegment[]): DashStream {
  return {
    id: "1",
    contentType: "audio",
    language: "eng",
    mimeCodec: 'audio/mp4; codecs="mp4a.40.2"',
    segments,
  };
}

const THREE: DashSegment[] = [
  { start: 0, duration: 6 },
  { start: 6, duration: 6 },
  { start: 12, duration: 6 },
];

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

describe("buffered-range helpers", () => {
  it("reports whether a time is buffered", () => {
    const b = buffer();
    b.ranges = [{ start: 0, end: 10 }];
    expect(isBuffered(asSourceBuffer(b), 5)).toBe(true);
    expect(isBuffered(asSourceBuffer(b), 20)).toBe(false);
  });

  it("reports nothing buffered for an empty buffer", () => {
    expect(isBuffered(asSourceBuffer(buffer()), 0)).toBe(false);
  });

  it("measures how far ahead the buffer runs", () => {
    const b = buffer();
    b.ranges = [{ start: 0, end: 18 }];
    expect(bufferedAhead(asSourceBuffer(b), 6)).toBe(12);
  });

  it("measures zero ahead outside every range", () => {
    const b = buffer();
    b.ranges = [{ start: 0, end: 5 }];
    expect(bufferedAhead(asSourceBuffer(b), 30)).toBe(0);
  });

  it("skips ranges that do not contain the playhead", () => {
    const b = buffer();
    b.ranges = [
      { start: 0, end: 3 },
      { start: 10, end: 20 },
    ];
    expect(bufferedAhead(asSourceBuffer(b), 12)).toBe(8);
  });
});

describe("nextSegment", () => {
  it("asks for the segment after what is already buffered", () => {
    const b = buffer();
    b.ranges = [{ start: 0, end: 12 }];
    // Buffered to 12s from t=0, so segment index 2 (12–18s) comes next.
    expect(nextSegment(THREE, asSourceBuffer(b), 0)).toBe(3);
  });

  it("asks for the segment at the playhead when nothing is buffered", () => {
    expect(nextSegment(THREE, asSourceBuffer(buffer()), 7)).toBe(1);
  });
});
