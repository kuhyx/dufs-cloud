import { useState } from "react";
import type { DashStream } from "../lib/dash-manifest.ts";
import { languageName } from "../lib/subtitles.ts";

interface AudioMenuProps {
  /** Selectable audio streams, one per language. */
  readonly tracks: readonly DashStream[];
  /** Stream id currently playing. */
  readonly active: string | null;
  readonly onSelect: (id: string) => void;
}

/** Label for one audio stream: its language name, or a numbered fallback. */
export function audioLabel(
  stream: DashStream,
  index: number,
): string {
  const named = languageName(stream.language);
  return named === "" ? `Track ${String(index + 1)}` : named;
}

/** Audio-track picker, shown in the viewer's controls beside the subtitle menu.
 *
 * Only appears for videos segmented into DASH — that is, the dual-audio ones,
 * where there is a second language to reach. Everything else has one audio
 * track and no choice to offer. */
export function AudioMenu({
  tracks,
  active,
  onSelect,
}: AudioMenuProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);

  // Nothing to choose between: a single-language video needs no control.
  if (tracks.length < 2) return null;

  const current = tracks.findIndex((t) => t.id === active);
  const playing = current < 0 ? undefined : tracks[current];
  const label =
    playing === undefined ? "Audio" : audioLabel(playing, current);

  return (
    <div
      className="audio-menu"
      onClick={(e) => {
        // The viewer closes on background clicks; this panel is not background.
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        className="audio-toggle"
        aria-expanded={open}
        aria-label="Audio track"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {label}
      </button>

      {open && (
        <div className="audio-panel" role="menu">
          {tracks.map((track, i) => (
            <button
              key={track.id}
              type="button"
              role="menuitemradio"
              aria-checked={track.id === active}
              className={track.id === active ? "is-active" : ""}
              onClick={() => {
                onSelect(track.id);
                setOpen(false);
              }}
            >
              {audioLabel(track, i)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
