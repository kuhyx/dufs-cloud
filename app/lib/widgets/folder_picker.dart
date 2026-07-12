import 'dart:async';

import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:flutter/material.dart';

/// A folder browser for choosing a move destination. Lists only directories,
/// lets the user descend or step up, and pops the chosen folder path. Reuses
/// [DufsClient.list], so no new server surface is needed.
class FolderPicker extends StatefulWidget {
  /// Creates a picker starting at [initialPath], moving [count] items.
  const FolderPicker({
    required this.client,
    required this.initialPath,
    required this.count,
    super.key,
  });

  /// The client used to list folders.
  final DufsClient client;

  /// Where browsing starts (usually the folder being moved out of).
  final String initialPath;

  /// How many items are being moved (shown in the app bar).
  final int count;

  @override
  State<FolderPicker> createState() => _FolderPickerState();
}

class _FolderPickerState extends State<FolderPicker> {
  late String _dir = widget.initialPath;
  List<DirEntry> _folders = <DirEntry>[];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final all = await widget.client.list(_dir);
      if (!mounted) return;
      setState(() {
        _folders = all.where((e) => e.isDir).toList();
        _loading = false;
      });
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  void _go(String dir) {
    _dir = dir;
    unawaited(_load());
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.count;
    return Scaffold(
      appBar: AppBar(title: Text('Move $n item${n == 1 ? '' : 's'} to…')),
      persistentFooterButtons: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Text(_dir, style: Theme.of(context).textTheme.bodySmall),
        ),
        FilledButton.icon(
          icon: const Icon(Icons.drive_file_move),
          label: const Text('Move here'),
          onPressed: () => Navigator.of(context).pop(_dir),
        ),
      ],
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text('Could not load: $_error'));
    }
    return ListView(
      children: [
        if (_dir != '/')
          ListTile(
            leading: const Icon(Icons.arrow_upward),
            title: const Text('..'),
            onTap: () => _go(paths.parentPath(_dir)),
          ),
        for (final folder in _folders)
          ListTile(
            leading: const Icon(Icons.folder),
            title: Text(folder.name),
            onTap: () => _go(folder.path),
          ),
      ],
    );
  }
}
