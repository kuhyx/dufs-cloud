import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/screens/browser/browser_transfers.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:dufs_client/widgets/cue.dart';
import 'package:dufs_client/widgets/icon_dialog.dart';
import 'package:flutter/material.dart';

/// Single-entry changes: delete, rename and new folder.
mixin BrowserMutations on BrowserTransfers {
  /// Deletes [entry] after confirmation.
  Future<void> delete(DirEntry entry) async {
    final client = dufsClient;
    if (client == null) return;
    final ok = await confirmDestructive(
      context,
      icon: Icons.delete,
      subject: entry.name,
      spoken: 'Delete ${entry.name}',
    );
    if (!ok) return;
    setState(() => busy = true);
    try {
      await client.delete(entry.path);
      cloudIndex = null;
      await load(currentPath);
    } on Exception catch (e) {
      snack(CueKind.error, 'Delete failed: $e', detail: entry.name);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  /// Renames [entry] to a name asked from the user.
  Future<void> rename(DirEntry entry) async {
    final client = dufsClient;
    if (client == null) return;
    final newName = await askName(
      context,
      icon: Icons.edit,
      spoken: 'Rename ${entry.name}',
      initial: entry.name,
    );
    if (newName == null || newName.isEmpty || newName == entry.name) return;
    setState(() => busy = true);
    try {
      await client.rename(entry.path, newName);
      cloudIndex = null;
      await load(currentPath);
    } on Exception catch (e) {
      snack(CueKind.error, 'Rename failed: $e', detail: entry.name);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  /// Creates a folder named by the user in the current folder.
  Future<void> newFolder() async {
    final client = dufsClient;
    if (client == null) return;
    final name = await askName(
      context,
      icon: Icons.create_new_folder,
      spoken: 'New folder',
    );
    if (name == null || name.isEmpty) return;
    setState(() => busy = true);
    try {
      await client.createDir(paths.joinPath(currentPath, name));
      cloudIndex = null;
      await load(currentPath);
    } on Exception catch (e) {
      snack(CueKind.error, 'Create failed: $e', detail: name);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}
