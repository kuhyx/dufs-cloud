import type { Dispatch, SetStateAction } from "react";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry, MetaIndex } from "../api/types.ts";
import { useSubtitleManifest } from "../hooks/use-subtitle-manifest.ts";
import { MediaViewer } from "./media-viewer.tsx";

interface GalleryViewerProps {
  readonly client: DufsClient;
  readonly meta: MetaIndex;
  readonly media: readonly DirEntry[];
  readonly siblings: readonly DirEntry[];
  /** Index into `media`; -1 means no viewer is open. */
  readonly index: number;
  readonly onIndexChange: Dispatch<SetStateAction<number>>;
}

/** The fullscreen media viewer, stepping through the on-screen media. */
export function GalleryViewer({
  client,
  meta,
  media,
  siblings,
  index,
  onIndexChange,
}: GalleryViewerProps): React.JSX.Element | null {
  const entry = index >= 0 && index < media.length ? media[index] : null;
  const subtitlesPath = entry ? (meta[entry.path]?.subtitlesPath ?? null) : null;
  const subtitleManifest = useSubtitleManifest(client, subtitlesPath);

  function step(delta: number): void {
    onIndexChange((cur) => (cur + delta + media.length) % media.length);
  }

  if (!entry) return null;
  return (
    <MediaViewer
      key={entry.path}
      entry={entry}
      url={client.fileUrl(meta[entry.path]?.proxyPath ?? entry.path)}
      siblings={siblings}
      subtitlesPath={subtitlesPath}
      subtitleManifest={subtitleManifest}
      dashPath={meta[entry.path]?.dashPath ?? null}
      onClose={() => {
        onIndexChange(-1);
      }}
      onPrev={() => {
        step(-1);
      }}
      onNext={() => {
        step(1);
      }}
    />
  );
}
