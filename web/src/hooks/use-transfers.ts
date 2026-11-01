import { useRef, useState } from "react";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { basename, joinPath } from "../lib/paths.ts";
import { buildSelectionZip, saveBytes } from "../lib/download.ts";
import { isAbort, type TransferProgress } from "../lib/transfer.ts";

interface TransferDeps {
  readonly client: DufsClient;
  readonly path: string;
  readonly setBusy: (message: string | null) => void;
  readonly refreshAll: () => void;
  readonly clearSelection: () => void;
}

export interface Transfers {
  readonly transfer: TransferProgress | null;
  readonly cancelTransfer: () => void;
  readonly uploadInto: (destDir: string, files: FileList | null) => void;
  readonly uploadHere: (files: FileList | null) => void;
  readonly downloadSelected: (
    zipBase: string,
    selectedEntries: readonly DirEntry[],
  ) => void;
}

/** Banner-tracked, cancellable batches: uploads and selection zips. */
export function useTransfers({
  client,
  path,
  setBusy,
  refreshAll,
  clearSelection,
}: TransferDeps): Transfers {
  // The in-flight upload/zip batch shown in the banner, and the controller
  // its Cancel button aborts.
  const [transfer, setTransfer] = useState<TransferProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Starts a banner-tracked batch; returns the controller Cancel aborts.
  function beginTransfer(): AbortController {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(null);
    return controller;
  }

  function endTransfer(message: string | null): void {
    abortRef.current = null;
    setTransfer(null);
    setBusy(message);
  }

  function cancelTransfer(): void {
    abortRef.current?.abort();
  }

  function uploadInto(destDir: string, files: FileList | null): void {
    if (files === null || files.length === 0) return;
    const list = Array.from(files);
    const controller = beginTransfer();
    void (async () => {
      // One bad file must not abort the batch; failures are named at the end.
      const failed: string[] = [];
      let done = 0;
      for (const [i, file] of list.entries()) {
        const progress: TransferProgress = {
          kind: "upload",
          index: i + 1,
          total: list.length,
          name: file.name,
          done: 0,
          size: file.size,
        };
        setTransfer(progress);
        try {
          await client.upload(destDir, file, {
            signal: controller.signal,
            onProgress: (sent) => {
              setTransfer({ ...progress, done: sent });
            },
          });
          done++;
        } catch (err: unknown) {
          if (isAbort(err)) {
            // dufs writes a PUT as it arrives, so the aborted file exists on
            // the server truncated, looking real. Best effort: remove it.
            try {
              await client.remove(joinPath(destDir, file.name));
            } catch {
              // Leaving a partial behind is the lesser evil here.
            }
            refreshAll();
            endTransfer(`Cancelled after ${done} of ${list.length}`);
            return;
          }
          failed.push(file.name);
        }
      }
      refreshAll();
      endTransfer(
        failed.length === 0
          ? null
          : `${failed.length} of ${list.length} failed: ${failed.join(", ")}`,
      );
    })();
  }

  function uploadHere(files: FileList | null): void {
    uploadInto(path, files);
  }

  function downloadSelected(
    zipBase: string,
    selectedEntries: readonly DirEntry[],
  ): void {
    setBusy(`Preparing ${selectedEntries.length} item(s)…`);
    const controller = beginTransfer();
    void (async () => {
      try {
        // Folders are gathered recursively and zipped in the browser: dufs's
        // server ?zip 404s for subfolders under render-spa (the prod config).
        const bytes = await buildSelectionZip(client, zipBase, selectedEntries, {
          signal: controller.signal,
          onProgress: setTransfer,
        });
        const base = basename(zipBase);
        saveBytes(bytes, `${base === "/" ? "cloud" : base}.zip`);
      } catch (err: unknown) {
        if (isAbort(err)) {
          endTransfer("Zip cancelled");
          return;
        }
        endTransfer(err instanceof Error ? err.message : String(err));
        return;
      }
      endTransfer(null);
      clearSelection();
    })();
  }

  return { transfer, cancelTransfer, uploadInto, uploadHere, downloadSelected };
}
