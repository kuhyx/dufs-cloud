import 'dart:async';
import 'dart:io';

import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/screens/browser/browser_loading.dart';
import 'package:dufs_client/services/device_picker.dart';
import 'package:dufs_client/services/download_zip.dart';
import 'package:dufs_client/services/public_downloads.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:dufs_client/widgets/cue.dart';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Upload, download and zip transfers tracked by the banner.
mixin BrowserTransfers on BrowserLoading {
  /// Starts a banner-tracked batch and returns its cancel flag, which every
  /// streaming loop in the batch checks between chunks.
  TransferCancel beginTransfer() {
    final cancel = TransferCancel();
    // Snackbars queue: a stale "Saved to …" from the last batch must not
    // delay this batch's own outcome by its remaining seconds.
    ScaffoldMessenger.of(context).clearSnackBars();
    setState(() {
      busy = true;
      transferCancel = cancel;
    });
    return cancel;
  }

  /// Shows [progress] in the banner.
  void report(TransferProgress progress) {
    if (mounted) setState(() => transfer = progress);
  }

  /// Ends the batch and hides the banner.
  void endTransfer() {
    if (!mounted) return;
    setState(() {
      busy = false;
      transfer = null;
      transferCancel = null;
    });
  }

  /// Where a download is staged before MediaStore moves it to Download/.
  Future<File> stageFile(String name) async {
    final getDir = widget.tempDir ?? getTemporaryDirectory;
    return File(p.join((await getDir()).path, name));
  }

  /// Deletes a staged file that will not be published.
  Future<void> discard(File? staged) async {
    if (staged != null && staged.existsSync()) await staged.delete();
  }

  /// Moves a fully staged file into the public Download/ folder and names
  /// the spot it landed in, with an Open action. The old app-private
  /// documents dir was a place no file manager could reach.
  Future<void> publish(File staged) async {
    final downloads = widget.publicDownloads ?? PublicDownloads();
    final saved = await downloads.save(staged.path, p.basename(staged.path));
    snack(
      CueKind.success,
      'Saved to ${saved.location}',
      detail: saved.location,
      duration: const Duration(seconds: 8),
      action: IconButton(
        icon: const Icon(Icons.open_in_new, semanticLabel: 'Open'),
        onPressed: () async {
          // Dismiss like a SnackBarAction would, so a follow-up cue shows.
          ScaffoldMessenger.of(context).hideCurrentSnackBar();
          if (!await downloads.open(saved)) {
            snack(
              CueKind.error,
              'No app can open ${saved.name}',
              detail: saved.name,
            );
          }
        },
      ),
    );
  }

  /// Downloads [entry] to Download/.
  Future<void> download(DirEntry entry) async {
    final client = dufsClient;
    if (client == null) return;
    final cancel = beginTransfer();
    final progress = TransferProgress(
      kind: TransferKind.download,
      index: 1,
      total: 1,
      name: entry.name,
      done: 0,
      size: entry.size,
    );
    report(progress);
    File? staged;
    try {
      staged = await stageFile(entry.name);
      final sink = staged.openWrite();
      try {
        await client.download(
          entry.path,
          onChunk: sink.add,
          onProgress: (n) => report(progress.withDone(n)),
          cancel: cancel,
        );
      } finally {
        await sink.close();
      }
      await publish(staged);
    } on TransferCancelled {
      await discard(staged);
      snack(CueKind.cancelled, 'Download cancelled');
    } on Exception catch (e) {
      await discard(staged);
      snack(CueKind.error, 'Download failed: $e', detail: entry.name);
    } finally {
      endTransfer();
    }
  }

  /// Picks files and uploads them into the current folder.
  Future<void> upload() async {
    final client = dufsClient;
    if (client == null) return;
    final files = await (widget.pickUploads ?? DevicePicker().pick)();
    if (files.isEmpty) return;
    final cancel = beginTransfer();
    final run = cue.begin();
    final failed = <String>[];
    var done = 0;
    try {
      for (final (i, file) in files.indexed) {
        final progress = TransferProgress(
          kind: TransferKind.upload,
          index: i + 1,
          total: files.length,
          name: file.name,
          done: 0,
          size: file.size,
        );
        report(progress);
        try {
          await client.upload(
            currentPath,
            file.name,
            file.open(),
            file.size,
            onProgress: (n) => report(progress.withDone(n)),
            cancel: cancel,
          );
          done++;
        } on TransferCancelled {
          // dufs writes a PUT as it arrives, so the aborted file exists on
          // the server truncated, looking real. Best effort: remove it.
          try {
            await client.delete(paths.joinPath(currentPath, file.name));
          } on Exception {
            // Leaving a partial behind is the lesser evil here.
          }
          rethrow;
        } on Exception {
          // One bad file must not abort the batch; it is named at the end.
          failed.add(file.name);
        }
      }
      if (failed.isEmpty) unawaited(run.succeeded());
      if (failed.isEmpty) {
        snack(CueKind.success, 'Uploaded $done', detail: '$done');
      } else {
        snack(
          CueKind.error,
          '${failed.length} of ${files.length} failed',
          detail: '${failed.length}/${files.length} · ${failed.join(', ')}',
        );
      }
    } on TransferCancelled {
      snack(
        CueKind.cancelled,
        'Cancelled after $done of ${files.length}',
        detail: '$done/${files.length}',
      );
    } finally {
      // Whatever landed is on the server now, so the listing must reflect it.
      cloudIndex = null;
      if (mounted) await load(currentPath);
      endTransfer();
    }
  }

  /// Zips the selected entries into Download/.
  Future<void> downloadSelectedZip() async {
    final client = dufsClient;
    if (client == null || selected.isEmpty) return;
    final cancel = beginTransfer();
    final run = cue.begin();
    File? staged;
    try {
      final bytes = await buildSelectionZip(
        client,
        currentPath,
        selectedEntries,
        onProgress: report,
        cancel: cancel,
      );
      staged = await stageFile('dufs-selection.zip');
      await staged.writeAsBytes(bytes);
      await publish(staged);
      unawaited(run.succeeded());
      exitSelect();
    } on TransferCancelled {
      snack(CueKind.cancelled, 'Zip cancelled');
    } on Exception catch (e) {
      await discard(staged);
      snack(CueKind.error, 'Zip failed: $e');
    } finally {
      endTransfer();
    }
  }
}
