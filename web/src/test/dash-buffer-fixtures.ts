import type { DashSegment, DashStream } from "../lib/dash-manifest.ts";

/** A SourceBuffer stand-in: jsdom has no MSE, and the behaviour that matters
 * here is the event protocol (append/remove complete asynchronously via
 * `updateend`, or fail via `error`), not real demuxing. */
export class FakeBuffer extends EventTarget {
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

export function buffer(): FakeBuffer {
  return new FakeBuffer();
}

export function asSourceBuffer(b: FakeBuffer): SourceBuffer {
  return b as unknown as SourceBuffer;
}

export function stream(segments: DashSegment[]): DashStream {
  return {
    id: "1",
    contentType: "audio",
    language: "eng",
    mimeCodec: 'audio/mp4; codecs="mp4a.40.2"',
    segments,
  };
}

export const THREE: DashSegment[] = [
  { start: 0, duration: 6 },
  { start: 6, duration: 6 },
  { start: 12, duration: 6 },
];
