import { useState } from "react";
import { subtitleLabel, type SubtitleTrack } from "../lib/subtitles.ts";

/** How far one nudge shifts subtitle timing, in milliseconds. */
export const OFFSET_STEP_MS = 100;

interface SubtitleMenuProps {
  readonly tracks: readonly SubtitleTrack[];
  /** Currently rendering track, or null for "off". */
  readonly active: SubtitleTrack | null;
  readonly onSelect: (track: SubtitleTrack | null) => void;
  /** Timing offset in ms; positive shows subtitles later. */
  readonly offsetMs: number;
  readonly onOffsetChange: (offsetMs: number) => void;
}

/** Subtitle track picker and timing nudge, shown in the viewer's controls.
 *
 * A picker rather than a toggle because the library's releases carry up to 17
 * languages in one file, and the offset exists because rips drift out of sync
 * often enough that a fixed delay is worth correcting in place. */
export function SubtitleMenu({
  tracks,
  active,
  onSelect,
  offsetMs,
  onOffsetChange,
}: SubtitleMenuProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);

  // Nothing to choose between: the control would only ever say "Off".
  if (tracks.length === 0) return null;

  return (
    <div
      className="subtitle-menu"
      onClick={(e) => {
        // The viewer closes on background clicks; this panel is not background.
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        className="subtitle-toggle"
        aria-expanded={open}
        aria-label="Subtitles"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {active === null ? "Subtitles: Off" : subtitleLabel(active)}
      </button>

      {open && (
        <div className="subtitle-panel" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={active === null}
            className={active === null ? "is-active" : ""}
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          >
            Off
          </button>

          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              role="menuitemradio"
              aria-checked={track.id === active?.id}
              className={track.id === active?.id ? "is-active" : ""}
              onClick={() => {
                onSelect(track);
                setOpen(false);
              }}
            >
              {subtitleLabel(track)}
            </button>
          ))}

          <div className="subtitle-offset">
            <span>Delay</span>
            <button
              type="button"
              aria-label="Subtitles earlier"
              onClick={() => {
                onOffsetChange(offsetMs - OFFSET_STEP_MS);
              }}
            >
              −
            </button>
            <span className="subtitle-offset-value">
              {(offsetMs / 1000).toFixed(1)}s
            </span>
            <button
              type="button"
              aria-label="Subtitles later"
              onClick={() => {
                onOffsetChange(offsetMs + OFFSET_STEP_MS);
              }}
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
