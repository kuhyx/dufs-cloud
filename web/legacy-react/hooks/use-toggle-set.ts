import { useState } from "react";

/** A set of keys with a toggle: add the key if absent, remove it if present. */
export function useToggleSet(): readonly [
  ReadonlySet<string>,
  (key: string) => void,
] {
  const [keys, setKeys] = useState<ReadonlySet<string>>(new Set());

  function toggle(key: string): void {
    setKeys((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return [keys, toggle];
}
