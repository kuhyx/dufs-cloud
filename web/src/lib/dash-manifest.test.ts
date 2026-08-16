import { describe, it, expect } from "vitest";
import {
  audioStreams,
  initUrl,
  parseDashManifest,
  parseDuration,
  segmentAt,
  segmentUrl,
  videoStream,
  type DashSegment,
} from "./dash-manifest.ts";

/** Parse and assert it worked, so tests can narrow without a `!`. */
function parsed(xml: string) {
  const m = parseDashManifest(xml);
  if (m === null) throw new Error("expected a parseable manifest");
  return m;
}

/** A manifest shaped like the ones generate_dash_streams.sh emits: one video
 * AdaptationSet and one per audio language, each with its own timeline. */
function mpd(body: string, duration = "PT0H1M0.0S"): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"
     mediaPresentationDuration="${duration}">
  <Period id="0">${body}</Period>
</MPD>`;
}

const VIDEO_SET = `
  <AdaptationSet id="0" contentType="video" lang="und">
    <Representation id="0" mimeType="video/mp4" codecs="avc1.640028">
      <SegmentTemplate timescale="1000"
        initialization="init-stream$RepresentationID$.m4s"
        media="chunk-stream$RepresentationID$-$Number%05d$.m4s">
        <SegmentTimeline><S t="0" d="6000" r="2" /></SegmentTimeline>
      </SegmentTemplate>
    </Representation>
  </AdaptationSet>`;

const AUDIO_SETS = `
  <AdaptationSet id="1" contentType="audio" lang="eng">
    <Representation id="1" mimeType="audio/mp4" codecs="mp4a.40.2">
      <SegmentTemplate timescale="1000"
        initialization="init-stream$RepresentationID$.m4s"
        media="chunk-stream$RepresentationID$-$Number%05d$.m4s">
        <SegmentTimeline><S t="0" d="4000" r="3" /></SegmentTimeline>
      </SegmentTemplate>
    </Representation>
  </AdaptationSet>
  <AdaptationSet id="2" contentType="audio" lang="jpn">
    <Representation id="2" mimeType="audio/mp4" codecs="mp4a.40.2">
      <SegmentTemplate timescale="1000"
        initialization="init-stream$RepresentationID$.m4s"
        media="chunk-stream$RepresentationID$-$Number%05d$.m4s">
        <SegmentTimeline><S t="0" d="4000" r="3" /></SegmentTimeline>
      </SegmentTemplate>
    </Representation>
  </AdaptationSet>`;

describe("parseDuration", () => {
  it("reads hours, minutes and seconds", () => {
    expect(parseDuration("PT1H2M3.5S")).toBeCloseTo(3723.5);
  });

  it("reads a minutes-and-seconds duration", () => {
    expect(parseDuration("PT23M56.0S")).toBeCloseTo(1436);
  });

  it("reads a duration with only some components present", () => {
    expect(parseDuration("PT90S")).toBeCloseTo(90);
    expect(parseDuration("PT2H")).toBeCloseTo(7200);
    expect(parseDuration("PT5M")).toBeCloseTo(300);
  });

  it("treats a missing or unparseable duration as unknown", () => {
    expect(parseDuration(null)).toBe(0);
    expect(parseDuration("garbage")).toBe(0);
  });
});

describe("parseDashManifest", () => {
  it("reads every stream with its own timeline", () => {
    const m = parsed(mpd(VIDEO_SET + AUDIO_SETS));
    expect(m.streams).toHaveLength(3);
    // Video and audio are NOT segment-aligned: 3 video vs 4 audio segments.
    expect(videoStream(m)?.segments).toHaveLength(3);
    expect(audioStreams(m)[0]?.segments).toHaveLength(4);
  });

  it("labels audio streams by language", () => {
    const m = parsed(mpd(VIDEO_SET + AUDIO_SETS));
    expect(audioStreams(m).map((s) => s.language)).toEqual(["eng", "jpn"]);
  });

  it("builds the MSE codec string from mimeType and codecs", () => {
    const m = parsed(mpd(VIDEO_SET + AUDIO_SETS));
    expect(videoStream(m)?.mimeCodec).toBe('video/mp4; codecs="avc1.640028"');
  });

  it("treats the muxer's 'und' as no language", () => {
    const m = parsed(mpd(VIDEO_SET + AUDIO_SETS));
    expect(videoStream(m)?.language).toBe("");
  });

  it("reads the presentation duration", () => {
    const m = parsed(mpd(VIDEO_SET, "PT0H0M18.0S"));
    expect(m.durationMs).toBe(18000);
  });

  it("expands a timeline that restates the time mid-stream", () => {
    const set = VIDEO_SET.replace(
      '<S t="0" d="6000" r="2" />',
      '<S t="0" d="6000" /><S t="12000" d="3000" />',
    );
    const m = parsed(mpd(set));
    expect(videoStream(m)?.segments).toEqual<DashSegment[]>([
      { start: 0, duration: 6 },
      { start: 12, duration: 3 },
    ]);
  });

  it("returns null for XML that is not a manifest", () => {
    expect(parseDashManifest("<not-a-manifest/>")).toBeNull();
  });

  it("returns null for malformed XML", () => {
    expect(parseDashManifest("<MPD><unclosed>")).toBeNull();
  });

  it("returns null when no stream carries segments", () => {
    expect(parseDashManifest(mpd(""))).toBeNull();
  });

  it("skips a set with no Representation or SegmentTemplate", () => {
    const bare = `<AdaptationSet id="9" contentType="audio"></AdaptationSet>`;
    const m = parsed(mpd(VIDEO_SET + bare));
    expect(m.streams).toHaveLength(1);
  });

  it("skips a Representation missing its id or codecs", () => {
    const broken = VIDEO_SET.replace('codecs="avc1.640028"', "");
    expect(parseDashManifest(mpd(broken))).toBeNull();
  });

  it("skips a template with no usable timescale", () => {
    const broken = VIDEO_SET.replace('timescale="1000"', 'timescale="0"');
    expect(parseDashManifest(mpd(broken))).toBeNull();
  });

  it("falls back to the set's mimeType when the representation omits it", () => {
    const set = VIDEO_SET.replace('<Representation id="0" mimeType="video/mp4"', '<Representation id="0"').replace(
      '<AdaptationSet id="0" contentType="video"',
      '<AdaptationSet id="0" mimeType="video/mp4" contentType="video"',
    );
    const m = parsed(mpd(set));
    expect(videoStream(m)?.mimeCodec).toBe('video/mp4; codecs="avc1.640028"');
  });

  it("treats a segment with no duration as zero-length rather than NaN", () => {
    const set = VIDEO_SET.replace('<S t="0" d="6000" r="2" />', "<S t=\"0\" />");
    const m = parsed(mpd(set));
    expect(videoStream(m)?.segments).toEqual<DashSegment[]>([
      { start: 0, duration: 0 },
    ]);
  });

  it("starts a timeline at zero when the first entry omits t", () => {
    const set = VIDEO_SET.replace('<S t="0" d="6000" r="2" />', '<S d="6000" />');
    const m = parsed(mpd(set));
    expect(videoStream(m)?.segments[0]?.start).toBe(0);
  });

  it("defaults a template with no timescale attribute to unusable", () => {
    const broken = VIDEO_SET.replace('timescale="1000"', "");
    expect(parseDashManifest(mpd(broken))).toBeNull();
  });

  it("reads a set that declares no language or contentType", () => {
    const set = VIDEO_SET.replace('contentType="video" lang="und"', "");
    const m = parsed(mpd(set));
    expect(m.streams[0]?.language).toBe("");
    expect(m.streams[0]?.contentType).toBe("");
  });

  it("reports no video stream when the manifest has only audio", () => {
    const m = parsed(mpd(AUDIO_SETS));
    expect(videoStream(m)).toBeNull();
  });
});

describe("segmentAt", () => {
  const segments: DashSegment[] = [
    { start: 0, duration: 6 },
    { start: 6, duration: 6 },
    { start: 12, duration: 6 },
  ];

  it("finds the segment covering a time", () => {
    expect(segmentAt(segments, 0)).toBe(0);
    expect(segmentAt(segments, 7)).toBe(1);
    expect(segmentAt(segments, 17.9)).toBe(2);
  });

  it("clamps past the end rather than running off the list", () => {
    expect(segmentAt(segments, 9999)).toBe(2);
  });

  it("returns 0 for an empty stream", () => {
    expect(segmentAt([], 5)).toBe(0);
  });
});

describe("segment URLs", () => {
  const stream = {
    id: "2",
    contentType: "audio",
    language: "jpn",
    mimeCodec: 'audio/mp4; codecs="mp4a.40.2"',
    segments: [],
  };

  it("names the initialization segment", () => {
    expect(initUrl("/.dash/v.mkv", stream)).toBe(
      "/.dash/v.mkv/init-stream2.m4s",
    );
  });

  it("names media segments 1-based and zero-padded, as written on disk", () => {
    expect(segmentUrl("/.dash/v.mkv", stream, 0)).toBe(
      "/.dash/v.mkv/chunk-stream2-00001.m4s",
    );
    expect(segmentUrl("/.dash/v.mkv", stream, 99)).toBe(
      "/.dash/v.mkv/chunk-stream2-00100.m4s",
    );
  });
});
