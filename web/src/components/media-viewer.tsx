import { useEffect, useState } from "react";
import type { DirEntry, SubtitleManifest } from "../api/types.ts";
import { isAudio, isImage, isPdf, isVideo } from "../lib/paths.ts";
import { useDashPlayer } from "../hooks/use-dash-player.ts";
import { useJassub } from "../hooks/use-jassub.ts";
import { useSubtitles } from "../hooks/use-subtitles.ts";
import { AudioMenu } from "./audio-menu.tsx";
import { SubtitleMenu } from "./subtitle-menu.tsx";

/** Shared empty listing, so defaulting `siblings` does not hand the subtitle
 * hook a fresh array identity on every render — that retriggers its memo, which
 * resets the active track, which renders again, forever. */
const NO_SIBLINGS: readonly DirEntry[] = [];

interface MediaViewerProps {
  readonly entry: DirEntry;
  readonly url: string;
  readonly onClose: () => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  /** Entries of the video's own directory, for sidecar subtitle discovery. */
  readonly siblings?: readonly DirEntry[];
  /** Where this video's extracted subtitles live, from the metadata index. */
  readonly subtitlesPath?: string | null;
  /** The extracted manifest, once fetched. */
  readonly subtitleManifest?: SubtitleManifest | null;
  /** Where this video's DASH segments live, for the audio-track picker; null
   * for the single-audio videos, which play the ordinary file. */
  readonly dashPath?: string | null;
}

/** Full-screen viewer: image lightbox (click-to-zoom) or an inline video player. */
export function MediaViewer({
  entry,
  url,
  onClose,
  onPrev,
  onNext,
  siblings = NO_SIBLINGS,
  subtitlesPath = null,
  subtitleManifest = null,
  dashPath = null,
}: MediaViewerProps): React.JSX.Element {
  // Zoom resets automatically per media because the parent keys this component
  // by path, remounting it on navigation.
  const [zoomed, setZoomed] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const subtitles = useSubtitles(
    entry,
    siblings,
    subtitlesPath,
    subtitleManifest,
  );
  useJassub(videoEl, subtitles.active, subtitles.fonts, subtitles.offsetMs);
  const dash = useDashPlayer(videoEl, dashPath);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
      // Arrows seek the video once it has focus; stealing them for file
      // navigation there made the player's own controls unusable.
      else if (e.target === videoEl) return;
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, onPrev, onNext, videoEl]);

  const video = isVideo(entry.name);

  return (
    <div className="overlay viewer" role="dialog" aria-modal="true">
      <button
        type="button"
        className="viewer-close"
        aria-label="Close"
        onClick={onClose}
      >
        ✕
      </button>
      <button
        type="button"
        className="viewer-nav prev"
        aria-label="Previous"
        onClick={onPrev}
      >
        ‹
      </button>
      <div className="viewer-stage" onClick={onClose}>
        {video ? (
          <video
            ref={setVideoEl}
            className="viewer-video"
            src={dash.src ?? url}
            controls
            autoPlay
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        ) : isImage(entry.name) ? (
          <img
            className={zoomed ? "viewer-img zoomed" : "viewer-img"}
            src={url}
            alt={entry.name}
            onClick={(e) => {
              e.stopPropagation();
              setZoomed((z) => !z);
            }}
          />
        ) : isPdf(entry.name) ? (
          <iframe
            className="viewer-pdf"
            src={url}
            title={entry.name}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        ) : isAudio(entry.name) ? (
          <div
            className="viewer-fallback"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <p>{entry.name}</p>
            <audio className="viewer-audio" src={url} controls autoPlay />
          </div>
        ) : (
          <div className="viewer-fallback">
            <p>{entry.name}</p>
            <a href={url} download>
              Download
            </a>
          </div>
        )}
      </div>
      <button
        type="button"
        className="viewer-nav next"
        aria-label="Next"
        onClick={onNext}
      >
        ›
      </button>
      {video && (
        <AudioMenu
          tracks={dash.audio}
          active={dash.activeAudio}
          onSelect={dash.selectAudio}
        />
      )}
      {video && (
        <SubtitleMenu
          tracks={subtitles.tracks}
          active={subtitles.active}
          onSelect={subtitles.select}
          offsetMs={subtitles.offsetMs}
          onOffsetChange={subtitles.setOffsetMs}
        />
      )}
      <div className="viewer-caption">{entry.name}</div>
    </div>
  );
}
