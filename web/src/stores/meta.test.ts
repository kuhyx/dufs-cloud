import { describe, it, expect } from "vitest";
import { createMeta } from "./meta.ts";
import { clientWith, deferred, flush } from "../test/store-helpers.ts";
import { meta as makeMeta } from "../test/meta.ts";
import type { MetaIndex } from "../api/types.ts";

describe("createMeta", () => {
  it("starts empty and adopts the fetched index", async () => {
    const index: MetaIndex = { "/a.mp4": makeMeta({ durationMs: 1000 }) };
    const store = createMeta(
      clientWith({ fetchMeta: () => Promise.resolve(index) }),
    );
    expect(store.getState()).toEqual({});
    let notified = 0;
    store.subscribe(() => {
      notified++;
    });
    await flush();
    expect(store.getState()).toEqual(index);
    expect(notified).toBe(1);
  });

  it("ignores a resolution that arrives after dispose", async () => {
    const pending = deferred<MetaIndex>();
    const store = createMeta(clientWith({ fetchMeta: () => pending.promise }));
    store.dispose();
    pending.resolve({ "/a.mp4": makeMeta() });
    await flush();
    expect(store.getState()).toEqual({});
  });
});
