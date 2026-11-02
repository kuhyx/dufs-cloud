import { vi } from "vitest";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

export function entry(path: string, kind: DirEntry["kind"] = "file"): DirEntry {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    kind,
    size: 1,
    mtimeMs: 0,
  };
}

/** A client exposing only the given methods, each wrapped in a spy. */
export function clientWith(methods: Partial<DufsClient>): DufsClient {
  const spied = Object.fromEntries(
    Object.entries(methods).map(([k, fn]) => [k, vi.fn(fn as () => unknown)]),
  );
  return spied as unknown as DufsClient;
}

/** Let every already-settled promise chain run to completion. */
export async function flush(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
