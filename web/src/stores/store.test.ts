import { createStore, memo } from "./store.ts";

describe("createStore", () => {
  it("returns the initial state and replaces it with a value", () => {
    const store = createStore(1);
    expect(store.getState()).toBe(1);
    store.setState(2);
    expect(store.getState()).toBe(2);
  });

  it("accepts an updater function", () => {
    const store = createStore(1);
    store.setState((n) => n + 4);
    expect(store.getState()).toBe(5);
  });

  it("notifies on change but not on an Object.is-equal value", () => {
    const store = createStore(1);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState(1);
    expect(listener).not.toHaveBeenCalled();
    store.setState(2);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("stops notifying after unsubscribe", () => {
    const store = createStore(0);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.setState(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies from a snapshot so a listener may unsubscribe itself", () => {
    const store = createStore(0);
    const second = vi.fn();
    const off = store.subscribe(() => {
      off();
    });
    store.subscribe(second);
    store.setState(1);
    store.setState(2);
    expect(second).toHaveBeenCalledTimes(2);
  });
});

describe("memo", () => {
  it("recomputes only when an argument changes", () => {
    const compute = vi.fn((a: number, b: number) => ({ sum: a + b }));
    const memoized = memo(compute);
    const first = memoized(1, 2);
    expect(memoized(1, 2)).toBe(first);
    expect(compute).toHaveBeenCalledOnce();
    const second = memoized(1, 3);
    expect(second).not.toBe(first);
    expect(second.sum).toBe(4);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
