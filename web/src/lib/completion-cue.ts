/** Two-note cue after a successful operation of >= 2 s; mirror of the Flutter
 * app's completion_cue.dart. Cancel/error paths never call `succeeded()`. */

export const CUE_STORAGE_KEY = "completion-sound";
const DEFAULT_MIN_ELAPSED_MS = 2000;

export function cueEnabled(storage: Storage = localStorage): boolean {
  return storage.getItem(CUE_STORAGE_KEY) !== "false";
}

export function setCueEnabled(on: boolean, storage: Storage = localStorage): void {
  storage.setItem(CUE_STORAGE_KEY, on ? "true" : "false");
}

export interface CueRun {
  succeeded: () => void;
}

export interface CompletionCue {
  begin: () => CueRun;
}

export interface CueOptions {
  readonly enabled?: () => boolean;
  readonly play?: () => void;
  readonly now?: () => number;
  readonly minElapsedMs?: number;
}

export function createCompletionCue({
  enabled = () => cueEnabled(),
  play = () => {
    playTwoNoteCue();
  },
  now = () => performance.now(),
  minElapsedMs = DEFAULT_MIN_ELAPSED_MS,
}: CueOptions = {}): CompletionCue {
  return {
    begin: () => {
      const start = now();
      let done = false;
      return {
        succeeded: () => {
          if (done) return;
          done = true;
          if (now() - start < minElapsedMs || !enabled()) return;
          try {
            play();
          } catch {
            // The cue is optional: no Web Audio means silence.
          }
        },
      };
    },
  };
}

const NOTES = [880, 1318.5] as const;
const NOTE_S = 0.1;
const PEAK_GAIN = 0.2;

let shared: AudioContext | null = null;

export function playTwoNoteCue(
  makeContext: () => AudioContext = () => new AudioContext(),
): void {
  shared ??= makeContext();
  const ctx = shared;
  void ctx.resume();
  NOTES.forEach((freq, i) => {
    const t0 = ctx.currentTime + i * NOTE_S;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + NOTE_S);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + NOTE_S);
  });
}

export function resetCueAudio(): void {
  shared = null;
}
