import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/screens/browser/browser_transfers.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:flutter/material.dart';

/// Single-entry changes: delete, rename and new folder.
mixin BrowserMutations on BrowserTransfers {
  /// Deletes [entry] after confirmation.
  Future<void> delete(DirEntry entry) async {
    final client = dufsClient;
    if (client == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete ${entry.name}?'),
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
    try {
      await client.delete(entry.path);
      cloudIndex = null;
      await load(currentPath);
    } on Exception catch (e) {
      snack('Delete failed: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  /// Renames [entry] to a name asked from the user.
  Future<void> rename(DirEntry entry) async {
    final client = dufsClient;
    if (client == null) return;
    final controller = TextEditingController(text: entry.name);
    final newName = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Rename "${entry.name}"'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'New name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Rename'),
          ),
        ],
      ),
    );
    if (newName == null || newName.isEmpty || newName == entry.name) return;
    setState(() => busy = true);
    try {
      await client.rename(entry.path, newName);
      cloudIndex = null;
      await load(currentPath);
    } on Exception catch (e) {
      snack('Rename failed: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  /// Creates a folder named by the user in the current folder.
  Future<void> newFolder() async {
    final client = dufsClient;
    if (client == null) return;
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New folder'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Folder name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    setState(() => busy = true);
    try {
      await client.createDir(paths.joinPath(currentPath, name));
      cloudIndex = null;
      await load(currentPath);
    } on Exception catch (e) {
      snack('Create failed: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}
