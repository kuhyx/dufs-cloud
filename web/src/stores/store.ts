export interface Readable<S> {
  getState: () => S;
  /** Returns the unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
}

export interface Store<S> extends Readable<S> {
  /** An `Object.is`-equal result notifies nobody. */
  setState: (next: S | ((current: S) => S)) => void;
}

export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (next) => {
      const value =
        typeof next === "function" ? (next as (current: S) => S)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Module-level stand-in for `useMemo`: recompute only when an arg changed. */
export function memo<D extends readonly unknown[], T>(
  compute: (...args: D) => T,
): (...args: D) => T {
  let lastArgs: D | undefined;
  let lastValue: T | undefined;
  return (...args: D): T => {
    if (lastArgs?.every((a, i) => Object.is(a, args[i])) === true) {
      return lastValue as T;
    }
    lastArgs = args;
    lastValue = compute(...args);
    return lastValue;
  };
}
