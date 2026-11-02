import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CUE_STORAGE_KEY,
  createCompletionCue,
  cueEnabled,
  playTwoNoteCue,
  resetCueAudio,
  setCueEnabled,
} from "./completion-cue.ts";

function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1000;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

describe("completion cue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("plays once after a run of at least 2 s", () => {
    const c = clock();
    const play = vi.fn();
    const run = createCompletionCue({ enabled: () => true, play, now: c.now }).begin();
    c.advance(2000);
    run.succeeded();
    run.succeeded();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("stays silent under 2 s, when disabled, or when never finished", () => {
    const c = clock();
    const play = vi.fn();
    let on = true;
    const cue = createCompletionCue({ enabled: () => on, play, now: c.now });
    const quick = cue.begin();
    c.advance(1999);
    quick.succeeded();
    const off = cue.begin();
    c.advance(5000);
    on = false;
    off.succeeded();
    cue.begin();
    expect(play).not.toHaveBeenCalled();
  });

  it("swallows a failing player", () => {
    const c = clock();
    const cue = createCompletionCue({
      enabled: () => true,
      play: () => {
        throw new Error("no audio");
      },
      now: c.now,
    });
    const run = cue.begin();
    c.advance(3000);
    expect(() => {
      run.succeeded();
    }).not.toThrow();
  });

  it("defaults to the stored toggle, the real clock and Web Audio", () => {
    resetCueAudio();
    const run = createCompletionCue({ minElapsedMs: -1 }).begin();
    expect(() => {
      run.succeeded();
    }).not.toThrow();
  });

  it("is on by default and persists the opt-out", () => {
    expect(cueEnabled()).toBe(true);
    setCueEnabled(false);
    expect(localStorage.getItem(CUE_STORAGE_KEY)).toBe("false");
    expect(cueEnabled()).toBe(false);
    setCueEnabled(true);
    expect(cueEnabled()).toBe(true);
  });
});

function fakeContext(): AudioContext {
  const param = (): Record<string, unknown> => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = (): Record<string, unknown> => ({
    type: "",
    frequency: param(),
    gain: param(),
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  });
  return {
    currentTime: 5,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(node),
    createGain: vi.fn(node),
  } as unknown as AudioContext;
}

describe("playTwoNoteCue", () => {
  it("schedules two short notes on one reused context", () => {
    resetCueAudio();
    const ctx = fakeContext();
    const make = vi.fn(() => ctx);
    playTwoNoteCue(make);
    playTwoNoteCue(make);
    expect(make).toHaveBeenCalledTimes(1);
    const oscs = vi.mocked(ctx.createOscillator).mock.results.map(
      (r) => r.value as OscillatorNode,
    );
    expect(oscs).toHaveLength(4);
    expect(oscs[0]?.frequency.value).toBe(880);
    expect(oscs[1]?.start).toHaveBeenCalledWith(5.1);
    expect(vi.mocked(oscs[1]?.stop)?.mock.calls[0]?.[0]).toBeCloseTo(5.2);
  });
});
