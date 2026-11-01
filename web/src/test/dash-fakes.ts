/** jsdom implements no part of MSE, so the whole boundary is faked: these
 * tests pin what this hook is responsible for — fetching the manifest, wiring
 * one buffer per stream, and re-feeding ONLY the audio buffer on a language
 * change — not libavformat's behaviour. */

export class FakeSourceBuffer extends EventTarget {
  updating = false;
  appended = 0;
  removed = 0;
  ranges: { start: number; end: number }[] = [];

  get buffered() {
    const r = this.ranges;
    return {
      length: r.length,
      start: (i: number) => r[i]?.start ?? 0,
      end: (i: number) => r[i]?.end ?? 0,
    };
  }

  private done(): void {
    queueMicrotask(() => {
      this.dispatchEvent(new Event("updateend"));
    });
  }

  appendBuffer(): void {
    this.appended += 1;
    this.done();
  }

  remove(): void {
    this.removed += 1;
    this.done();
  }
}

/** Every MediaSource built during a test, newest last. */
export const sources: FakeMediaSource[] = [];

/** When true, the NEXT MediaSource refuses addSourceBuffer, as a browser does
 * for a codec it will not decode. Per-instance on purpose: patching the shared
 * prototype leaked into every later test in this file. */
let refuseNext = false;

export class FakeMediaSource extends EventTarget {
  readyState = "open";
  sourceBuffers: FakeSourceBuffer[] = [];
  /** When set, addSourceBuffer throws it (an unsupported codec). */
  refuse: Error | null = null;

  constructor() {
    super();
    if (refuseNext) {
      this.refuse = new Error("unsupported");
      refuseNext = false;
    }
    sources.push(this);
  }

  /** The real event fires only once a media element attaches the object URL,
   * i.e. after the effect subscribes — never from the constructor, which runs
   * during render inside useMemo. Deferring to the listener being added models
   * that without a timer, so a microtask drain settles the whole startup. */
  private opened = false;

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    super.addEventListener(type, listener);
    // Fire ONCE, like a real MediaSource: it opens when a media element
    // attaches the object URL, not once per listener. Re-firing per listener
    // let both StrictMode effect runs attach buffers to the same source, which
    // is not something a browser ever does.
    if (type === "sourceopen" && !this.opened) {
      this.opened = true;
      queueMicrotask(() => {
        this.dispatchEvent(new Event("sourceopen"));
      });
    }
  }

  addSourceBuffer(): FakeSourceBuffer {
    if (this.refuse !== null) throw this.refuse;
    const b = new FakeSourceBuffer();
    this.sourceBuffers.push(b);
    return b;
  }
}

/** Makes the NEXT MediaSource refuse addSourceBuffer. */
export function refuseNextCodec(): void {
  refuseNext = true;
}

/** Forgets every MediaSource and any pending refusal. */
export function resetFakes(): void {
  sources.length = 0;
  refuseNext = false;
}
