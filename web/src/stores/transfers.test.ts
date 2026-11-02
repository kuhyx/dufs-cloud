import type { DufsClient, TransferOptions } from "../api/dufs-client.ts";
import { buildSelectionZip, saveBytes } from "../lib/download.ts";
import type { TransferProgress } from "../lib/transfer.ts";
import { fileAt, makeClient } from "../test/client-fixtures.ts";
import { createTransfers } from "./transfers.ts";

vi.mock("../lib/download.ts", () => ({
  buildSelectionZip: vi.fn(),
  saveBytes: vi.fn(),
}));

const zipMock = vi.mocked(buildSelectionZip);
const saveMock = vi.mocked(saveBytes);
const bytes = new Uint8Array(new ArrayBuffer(2));

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const abortError = (): DOMException => new DOMException("x", "AbortError");

const files = (...names: string[]): FileList =>
  names.map((n) => new File(["abc"], n)) as unknown as FileList;

/** Rejects with an AbortError once the batch's signal fires. */
const hangUntilAborted: DufsClient["upload"] = (_dir, _file, opts) =>
  new Promise((_resolve, reject) => {
    opts?.signal?.addEventListener("abort", () => {
      reject(abortError());
    });
  });

function setup(overrides: Partial<DufsClient> = {}) {
  const client = makeClient(overrides);
  const setBusy = vi.fn();
  const refreshAll = vi.fn();
  const clearSelection = vi.fn();
  const transfers = createTransfers({
    client,
    getPath: () => "/dir",
    setBusy,
    refreshAll,
    clearSelection,
  });
  return { client, setBusy, refreshAll, clearSelection, transfers };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uploads", () => {
  it("ignores a null or empty selection", () => {
    const { client, transfers } = setup();
    transfers.uploadInto("/d", null);
    transfers.uploadInto("/d", files());
    expect(client.upload).not.toHaveBeenCalled();
    expect(transfers.getState().transfer).toBeNull();
  });

  it("uploads each file with progress, then refreshes and clears", async () => {
    const seen: (TransferProgress | null)[] = [];
    const holder: { read: () => TransferProgress | null } = {
      read: () => null,
    };
    const upload = vi.fn(
      (_d: string, _f: File, opts?: TransferOptions): Promise<void> => {
        opts?.onProgress?.(2);
        seen.push(holder.read());
        return Promise.resolve();
      },
    );
    const { setBusy, refreshAll, transfers } = setup({ upload });
    holder.read = () => transfers.getState().transfer;
    transfers.uploadInto("/d", files("a.txt", "b.txt"));
    await flush();
    expect(seen[0]).toMatchObject({
      kind: "upload",
      index: 1,
      total: 2,
      name: "a.txt",
      done: 2,
      size: 3,
    });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(transfers.getState().transfer).toBeNull();
    expect(setBusy).toHaveBeenLastCalledWith(null);
    expect(refreshAll).toHaveBeenCalledOnce();
  });

  it("uploads into the current path with uploadHere", async () => {
    const { client, transfers } = setup();
    transfers.uploadHere(files("a.txt"));
    await flush();
    expect(vi.mocked(client.upload).mock.calls[0]?.[0]).toBe("/dir");
  });

  it("names failed files but keeps uploading the rest", async () => {
    const upload = vi
      .fn<DufsClient["upload"]>()
      .mockRejectedValueOnce(new Error("bad"))
      .mockResolvedValue(undefined);
    const { setBusy, refreshAll, transfers } = setup({ upload });
    transfers.uploadInto("/d", files("a.txt", "b.txt"));
    await flush();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(setBusy).toHaveBeenLastCalledWith("1 of 2 failed: a.txt");
    expect(refreshAll).toHaveBeenCalledOnce();
  });

  it("cancels, removes the partial file and reports progress", async () => {
    const { client, setBusy, refreshAll, transfers } = setup({
      upload: hangUntilAborted,
    });
    transfers.uploadInto("/d", files("a.txt", "b.txt"));
    await flush();
    expect(transfers.getState().transfer?.name).toBe("a.txt");
    transfers.cancelTransfer();
    await flush();
    expect(client.remove).toHaveBeenCalledExactlyOnceWith("/d/a.txt");
    expect(refreshAll).toHaveBeenCalledOnce();
    expect(setBusy).toHaveBeenLastCalledWith("Cancelled after 0 of 2");
    expect(transfers.getState().transfer).toBeNull();
  });

  it("still reports a cancel when removing the partial fails", async () => {
    const { setBusy, transfers } = setup({
      upload: hangUntilAborted,
      remove: vi.fn(() => Promise.reject(new Error("gone"))),
    });
    transfers.uploadInto("/d", files("a.txt"));
    await flush();
    transfers.dispose();
    await flush();
    expect(setBusy).toHaveBeenLastCalledWith("Cancelled after 0 of 1");
  });

  it("treats cancel with nothing in flight as a no-op", () => {
    const { setBusy, transfers } = setup();
    transfers.cancelTransfer();
    expect(setBusy).not.toHaveBeenCalled();
  });
});

describe("downloadSelected", () => {
  const picked = [fileAt("/dir/a.txt")];

  it("zips, saves under the folder name and clears the selection", async () => {
    const progress: TransferProgress = {
      kind: "download",
      index: 1,
      total: 1,
      name: "a.txt",
      done: 0,
      size: 10,
    };
    zipMock.mockImplementation((_c, _b, _e, opts) => {
      opts?.onProgress?.(progress);
      return Promise.resolve(bytes);
    });
    const { client, setBusy, clearSelection, transfers } = setup();
    transfers.downloadSelected("/dir", picked);
    expect(setBusy).toHaveBeenCalledWith("Preparing 1 item(s)…");
    expect(transfers.getState().transfer).toEqual(progress);
    await flush();
    expect(zipMock.mock.calls[0]?.slice(0, 3)).toEqual([client, "/dir", picked]);
    expect(saveMock).toHaveBeenCalledExactlyOnceWith(bytes, "dir.zip");
    expect(transfers.getState().transfer).toBeNull();
    expect(setBusy).toHaveBeenLastCalledWith(null);
    expect(clearSelection).toHaveBeenCalledOnce();
  });

  it("names the root download cloud.zip", async () => {
    zipMock.mockResolvedValue(bytes);
    const { transfers } = setup();
    transfers.downloadSelected("/", picked);
    await flush();
    expect(saveMock).toHaveBeenCalledWith(bytes, "cloud.zip");
  });

  it("reports a cancelled zip without saving or clearing", async () => {
    zipMock.mockRejectedValue(abortError());
    const { setBusy, clearSelection, transfers } = setup();
    transfers.downloadSelected("/dir", picked);
    await flush();
    expect(setBusy).toHaveBeenLastCalledWith("Zip cancelled");
    expect(saveMock).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
  });

  it("reports an Error message and a non-Error rejection", async () => {
    zipMock.mockRejectedValueOnce(new Error("disk full"));
    const { setBusy, transfers } = setup();
    transfers.downloadSelected("/dir", picked);
    await flush();
    expect(setBusy).toHaveBeenLastCalledWith("disk full");
    zipMock.mockRejectedValueOnce("odd");
    transfers.downloadSelected("/dir", picked);
    await flush();
    expect(setBusy).toHaveBeenLastCalledWith("odd");
  });

  it("aborts the zip signal on cancel", () => {
    let signal: AbortSignal | undefined;
    zipMock.mockImplementation((_c, _b, _e, opts) => {
      signal = opts?.signal;
      return new Promise(() => undefined);
    });
    const { transfers } = setup();
    transfers.downloadSelected("/dir", picked);
    transfers.cancelTransfer();
    expect(signal?.aborted).toBe(true);
  });
});
