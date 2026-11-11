/** The topbar's status note: what runs (a glyph per kind), a count and the
 * entry's name (user content). `spoken` keeps the full sentence for screen
 * readers; it is never painted. */
export type BusyKind = "move" | "delete" | "rename" | "create" | "zip" | "cancelled" | "failed" | "error";

export interface Busy {
  readonly kind: BusyKind;
  readonly spoken: string;
  /** Numbers only: `2`, or `1/3` for "1 of 3". */
  readonly count?: string;
  readonly name?: string;
}

export const BUSY_GLYPH: Readonly<Record<BusyKind, string>> = {
  move: "➜📁",
  delete: "🗑",
  rename: "✏️",
  create: "📁＋",
  zip: "🗜",
  cancelled: "⊘",
  failed: "⚠",
  error: "⚠",
};

/** Kinds still running: the note gets a spinner. */
export function busyRunning(kind: BusyKind): boolean {
  return kind !== "cancelled" && kind !== "failed" && kind !== "error";
}

/** A failure whose only detail is the error message (spoken, not painted). */
export function busyError(err: unknown): Busy {
  return { kind: "error", spoken: err instanceof Error ? err.message : String(err) };
}
