import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/screens/browser/browser_mutations.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:dufs_client/widgets/folder_picker.dart';
import 'package:flutter/material.dart';

/// Bulk changes: move or delete the selection, or drop entries on a folder.
mixin BrowserBatch on BrowserMutations {
  /// Runs [op] over every selected entry, collecting failures so one bad item
  /// does not abort the batch; returns the number that failed.
  Future<int> batch(Future<void> Function(DirEntry) op) async {
    var failed = 0;
    for (final entry in selectedEntries) {
      try {
        await op(entry);
      } on Exception {
        failed++;
      }
    }
    return failed;
  }

  /// Moves the selection into a folder chosen in the picker.
  Future<void> moveSelected() async {
    final client = dufsClient;
    if (client == null || selected.isEmpty) return;
    final dest = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (_) => FolderPicker(
          client: client,
          initialPath: currentPath,
          count: selected.length,
        ),
      ),
    );
    // Cancelled, or a no-op move into the folder the items already live in.
    if (dest == null || dest == currentPath) return;
    setState(() => busy = true);
    final failed = await batch((e) => client.move(e.path, dest));
    if (failed > 0) snack('$failed item(s) could not be moved');
    cloudIndex = null;
    exitSelect();
    await load(currentPath);
    if (mounted) setState(() => busy = false);
  }

  /// Deletes the selection after confirmation.
  Future<void> deleteSelected() async {
    final client = dufsClient;
    if (client == null || selected.isEmpty) return;
    final n = selected.length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete $n item${n == 1 ? '' : 's'}?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => busy = true);
    final failed = await batch((e) => client.delete(e.path));
    if (failed > 0) snack('$failed item(s) could not be deleted');
    cloudIndex = null;
    exitSelect();
    await load(currentPath);
    if (mounted) setState(() => busy = false);
  }

  /// Moves the dropped entries into [destDir], skipping any the drop rules
  /// disallow. Mirrors [moveSelected]'s batching so one bad item cannot abort
  /// the rest.
  Future<void> moveDropped(String destDir, List<String> dropped) async {
    final client = dufsClient;
    if (client == null) return;
    final movable = paths.movableInto(dropped, destDir);
    if (movable.isEmpty) return;
    setState(() => busy = true);
    var failed = 0;
    for (final path in movable) {
      try {
        await client.move(path, destDir);
      } on Exception {
        failed++;
      }
    }
    if (failed > 0) snack('$failed item(s) could not be moved');
    cloudIndex = null;
    exitSelect();
    await load(currentPath);
    if (mounted) setState(() => busy = false);
  }
}
