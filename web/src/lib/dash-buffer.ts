/** SourceBuffer plumbing for the DASH player.
 *
 * Split out of the React hook so the awkward parts — appends are asynchronous
 * and serialised per buffer, `remove()` is too, and both reject rather than
 * throw once the MediaSource has gone away — are testable without a component.
 *
 * Everything here is written to survive teardown: closing the viewer mid-fetch
 * detaches the MediaSource, and every pending operation then fails. Those
 * failures are expected and must not surface as unhandled rejections. */

import {
  segmentAt,
  segmentUrl,
  type DashSegment,
  type DashStream,
} from "./dash-manifest.ts";

/** How many segments to keep ahead of the playhead. Three 6-second segments is
 * roughly 18 s of buffer — enough to ride out a slow response without holding
 * a large span of a 24-minute episode in memory. */
export const BUFFER_AHEAD = 3;

/** Await one SourceBuffer operation.
 *
 * Resolves on `updateend` and, deliberately, ALSO resolves on error: a failed
 * append during teardown is not something the caller can act on, and turning it
 * into a rejection only creates an unhandled one. Callers detect real trouble
 * by checking what actually ended up buffered. */
export function settled(buffer: SourceBuffer): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      buffer.removeEventListener("updateend", done);
      buffer.removeEventListener("error", done);
      resolve();
    };
    buffer.addEventListener("updateend", done);
    buffer.addEventListener("error", done);
  });
}

/** Append `data`, waiting for it to land. */
export async function append(
  buffer: SourceBuffer,
  data: ArrayBuffer,
): Promise<void> {
  const wait = settled(buffer);
  try {
    buffer.appendBuffer(data);
  } catch {
    // Raised when the MediaSource closed under us, or the buffer is full.
    // Either way there is nothing to wait for.
    return;
  }
  await wait;
}

/** Drop everything currently buffered, waiting for the removal to land. */
export async function clear(buffer: SourceBuffer): Promise<void> {
  const wait = settled(buffer);
  try {
    buffer.remove(0, Infinity);
  } catch {
    return;
  }
  await wait;
}

/** Fetch one URL as bytes, or null when it is unavailable.
 *
 * Null rather than a throw because a missing segment past the end of a stream
 * is normal at the tail of a video, not an error worth breaking playback for. */
export async function fetchSegment(
  url: string,
  signal: AbortSignal,
): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin", signal });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Feed `count` segments starting at `from` into `buffer`.
 *
 * Sequential on purpose: SourceBuffer rejects an append while another is in
 * flight, so these cannot be parallelised without a queue, and the buffer-ahead
 * window is small enough that serial fetches keep up. */
export async function feed(
  buffer: SourceBuffer,
  dir: string,
  stream: DashStream,
  from: number,
  count: number,
  signal: AbortSignal,
): Promise<void> {
  const last = Math.min(from + count, stream.segments.length);
  for (let i = from; i < last; i++) {
    // Re-read through the controller each time: the viewer can close mid-feed,
    // and appending to a detached buffer after that is pointless work.
    if (signal.aborted) return;
    const data = await fetchSegment(segmentUrl(dir, stream, i), signal);
    if (data === null) continue;
    await append(buffer, data);
  }
}

/** Whether `time` is already covered by `buffer`. */
export function isBuffered(buffer: SourceBuffer, time: number): boolean {
  const ranges = buffer.buffered;
  for (let i = 0; i < ranges.length; i++) {
    if (time >= ranges.start(i) && time < ranges.end(i)) return true;
  }
  return false;
}

/** How far ahead of `time` `buffer` holds data, in seconds. */
export function bufferedAhead(buffer: SourceBuffer, time: number): number {
  const ranges = buffer.buffered;
  for (let i = 0; i < ranges.length; i++) {
    if (time >= ranges.start(i) && time < ranges.end(i)) {
      return ranges.end(i) - time;
    }
  }
  return 0;
}

/** Index of the next segment to fetch to keep `time` buffered ahead. */
export function nextSegment(
  segments: readonly DashSegment[],
  buffer: SourceBuffer,
  time: number,
): number {
  const ahead = bufferedAhead(buffer, time);
  return segmentAt(segments, time + ahead) + (ahead > 0 ? 1 : 0);
}
