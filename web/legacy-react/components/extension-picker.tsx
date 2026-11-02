import { useState } from "react";

interface ExtensionPickerProps {
  /** Extensions present in the current scope (options). */
  readonly available: readonly string[];
  /** Extensions to keep (allowlist). */
  readonly includes: readonly string[];
  /** Extensions to drop (denylist). */
  readonly excludes: readonly string[];
  readonly onChange: (includes: string[], excludes: string[]) => void;
}

type ExtState = "off" | "include" | "exclude";

/**
 * A tri-state extension filter. Each extension cycles on click:
 * off → include (✓) → exclude (✕) → off. This shows every available extension
 * at once (unlike a datalist) and lets you both pick some ("webp + png") and
 * ban others ("not webp") without a separate mode toggle. Fully controlled.
 */
export function ExtensionPicker({
  available,
  includes,
  excludes,
  onChange,
}: ExtensionPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const stateOf = (ext: string): ExtState =>
    includes.includes(ext) ? "include" : excludes.includes(ext) ? "exclude" : "off";

  // off → include → exclude → off, rebuilding both lists from the new state.
  function cycle(ext: string): void {
    const next: ExtState =
      stateOf(ext) === "off"
        ? "include"
        : stateOf(ext) === "include"
          ? "exclude"
          : "off";
    const inc = includes.filter((e) => e !== ext);
    const exc = excludes.filter((e) => e !== ext);
    if (next === "include") inc.push(ext);
    else if (next === "exclude") exc.push(ext);
    onChange(inc, exc);
  }

  const summary =
    [
      includes.length > 0 ? includes.join(", ") : "",
      excludes.length > 0 ? `not ${excludes.join(", ")}` : "",
    ]
      .filter((s) => s !== "")
      .join(" · ") || "Any ext";

  const glyph: Record<ExtState, string> = {
    off: "☐",
    include: "✓",
    exclude: "✕",
  };

  return (
    <span className="extpicker">
      <button
        type="button"
        className="extpicker-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {summary} ▾
      </button>
      {open && (
        <>
          <button
            type="button"
            className="extpicker-backdrop"
            aria-label="Close extension menu"
            onClick={() => {
              setOpen(false);
            }}
          />
          <div className="extpicker-menu">
            <p className="extpicker-hint muted">Click to cycle: keep ✓ · drop ✕</p>
            {available.length === 0 && (
              <p className="muted extpicker-empty">No extensions in view.</p>
            )}
            {available.map((ext) => {
              const st = stateOf(ext);
              return (
                <button
                  key={ext}
                  type="button"
                  className={`extpicker-opt ext-${st}`}
                  aria-label={`${ext}: ${st}`}
                  onClick={() => {
                    cycle(ext);
                  }}
                >
                  <span className="ext-glyph" aria-hidden="true">
                    {glyph[st]}
                  </span>
                  {ext}
                </button>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}
