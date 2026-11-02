export const jassub = {
  made: [] as { subUrl: string; timeOffset: number }[],
  destroyed: 0,
};

/** Stand-in for the WASM renderer jsdom cannot run (see stores/jassub.test.ts). */
export class FakeJassub {
  timeOffset = 0;
  subUrl: string;

  constructor(opts: { subUrl: string }) {
    this.subUrl = opts.subUrl;
    jassub.made.push(this);
  }

  destroy(): Promise<void> {
    jassub.destroyed += 1;
    return Promise.resolve();
  }
}
