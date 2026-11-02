import { useRef } from "react";
import { crumbs } from "../lib/paths.ts";

interface GalleryTopbarProps {
  readonly path: string;
  readonly busy: string | null;
  readonly onGo: (path: string) => void;
  readonly onNewFolder: () => void;
  readonly onUploadPicked: (files: FileList | null) => void;
}

/** Breadcrumb trail plus the folder-level actions (busy note, new, upload). */
export function GalleryTopbar({
  path,
  busy,
  onGo,
  onNewFolder,
  onUploadPicked,
}: GalleryTopbarProps): React.JSX.Element {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs(path).map((c, i, all) => (
          <span key={c.path}>
            <button
              type="button"
              className="crumb"
              onClick={() => {
                onGo(c.path);
              }}
            >
              {c.name}
            </button>
            {i < all.length - 1 && <span className="crumb-sep">/</span>}
          </span>
        ))}
      </nav>
      <div className="tools">
        {busy !== null && <span className="busy">{busy}</span>}
        <button type="button" onClick={onNewFolder}>
          New folder
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          Upload
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onUploadPicked(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </header>
  );
}
