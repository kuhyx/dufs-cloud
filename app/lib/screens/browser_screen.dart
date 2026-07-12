import 'dart:async';
import 'dart:io';

import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/screens/image_screen.dart';
import 'package:dufs_client/screens/settings_screen.dart';
import 'package:dufs_client/screens/video_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// The main screen: browse the cloud, open media, upload, download and delete.
class BrowserScreen extends StatefulWidget {
  /// Creates the browser backed by [settings].
  const BrowserScreen({required this.settings, super.key});

  /// Persisted connection settings.
  final Settings settings;

  @override
  State<BrowserScreen> createState() => _BrowserScreenState();
}

class _BrowserScreenState extends State<BrowserScreen> {
  DufsClient? _client;
  String _path = '/';
  List<DirEntry> _entries = <DirEntry>[];
  bool _loading = true;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    _client?.close();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    if (!widget.settings.isConfigured) {
      setState(() {
        _loading = false;
        _error = 'Tap the gear to set your cloud URL and login.';
      });
      return;
    }
    _client?.close();
    _client = DufsClient(
      baseUrl: widget.settings.baseUrl,
      username: widget.settings.username,
      password: await widget.settings.password(),
    );
    await _load('/');
  }

  Future<void> _load(String path) async {
    final client = _client;
    if (client == null) return;
    setState(() {
      _loading = true;
      _error = null;
      _path = path;
    });
    try {
      final entries = await client.list(path);
      if (!mounted) return;
      setState(() {
        _entries = entries;
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

  String get _parent {
    if (_path == '/') return '/';
    final cut = _path.substring(0, _path.lastIndexOf('/'));
    return cut.isEmpty ? '/' : cut;
  }

  Future<void> _open(DirEntry entry) async {
    final client = _client;
    if (client == null) return;
    if (entry.isDir) {
      await _load(entry.path);
    } else if (entry.isImage) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ImageScreen(
            client: client,
            path: entry.path,
            title: entry.name,
          ),
        ),
      );
    } else if (entry.isVideo) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => VideoScreen(
            client: client,
            path: entry.path,
            title: entry.name,
          ),
        ),
      );
    } else {
      await _download(entry);
    }
  }

  Future<void> _download(DirEntry entry) async {
    final client = _client;
    if (client == null) return;
    setState(() => _busy = true);
    try {
      final bytes = await client.download(entry.path);
      final dir = await getApplicationDocumentsDirectory();
      final file = File(p.join(dir.path, entry.name));
      await file.writeAsBytes(bytes);
      _snack('Saved ${entry.name} to app storage');
    } on Exception catch (e) {
      _snack('Download failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _upload() async {
    final client = _client;
    if (client == null) return;
    final picked = await ImagePicker().pickMedia();
    if (picked == null) return;
    setState(() => _busy = true);
    try {
      await client.upload(_path, picked.name, await picked.readAsBytes());
      _snack('Uploaded ${picked.name}');
      await _load(_path);
    } on Exception catch (e) {
      _snack('Upload failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(DirEntry entry) async {
    final client = _client;
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
    setState(() => _busy = true);
    try {
      await client.delete(entry.path);
      await _load(_path);
    } on Exception catch (e) {
      _snack('Delete failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openSettings() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => SettingsScreen(settings: widget.settings),
      ),
    );
    if (changed ?? false) await _bootstrap();
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: _path == '/'
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_upward),
                tooltip: 'Up',
                onPressed: () => _load(_parent),
              ),
        title: Text(_path == '/' ? 'Cloud' : _path),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: _openSettings,
          ),
        ],
      ),
      floatingActionButton: _client == null
          ? null
          : FloatingActionButton(
              onPressed: _busy ? null : _upload,
              child: const Icon(Icons.upload),
            ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, textAlign: TextAlign.center),
        ),
      );
    }
    if (_entries.isEmpty) {
      return const Center(child: Text('This folder is empty.'));
    }
    return RefreshIndicator(
      onRefresh: () => _load(_path),
      child: ListView.builder(
        itemCount: _entries.length,
        itemBuilder: (context, i) {
          final entry = _entries[i];
          return ListTile(
            leading: Icon(_iconFor(entry)),
            title: Text(entry.name),
            subtitle: entry.isDir ? null : Text('${entry.size} bytes'),
            onTap: _busy ? null : () => _open(entry),
            trailing: entry.isDir
                ? const Icon(Icons.chevron_right)
                : PopupMenuButton<String>(
                    onSelected: (v) {
                      if (v == 'download') unawaited(_download(entry));
                      if (v == 'delete') unawaited(_delete(entry));
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: 'download',
                        child: Text('Download'),
                      ),
                      PopupMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                  ),
          );
        },
      ),
    );
  }

  IconData _iconFor(DirEntry entry) {
    if (entry.isDir) return Icons.folder;
    if (entry.isImage) return Icons.image;
    if (entry.isVideo) return Icons.movie;
    return Icons.insert_drive_file;
  }
}
