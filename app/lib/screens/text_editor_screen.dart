import 'dart:async';

import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';

/// A minimal editor for `.txt`/`.md` files: loads the text over WebDAV, lets
/// the user edit it, and saves it back with a PUT. Mirrors the web editor.
class TextEditorScreen extends StatefulWidget {
  /// Creates the editor for [path] using [client]; [title] labels the app bar.
  const TextEditorScreen({
    required this.client,
    required this.path,
    required this.title,
    super.key,
  });

  /// The client used to read and write the file.
  final DufsClient client;

  /// Absolute cloud path of the text file.
  final String path;

  /// App-bar title (usually the file's base name).
  final String title;

  @override
  State<TextEditorScreen> createState() => _TextEditorScreenState();
}

class _TextEditorScreenState extends State<TextEditorScreen> {
  final TextEditingController _controller = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final text = await widget.client.readText(widget.path);
      if (!mounted) return;
      setState(() {
        _controller.text = text;
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

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await widget.client.writeText(widget.path, _controller.text);
      _snack('Saved ${widget.title}');
    } on Exception catch (e) {
      _snack('Save failed: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
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
        title: Text(widget.title),
        actions: [
          IconButton(
            icon: const Icon(Icons.save),
            tooltip: 'Save',
            onPressed: (_loading || _saving || _error != null) ? null : _save,
          ),
        ],
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
          child: Text('Could not open: $_error', textAlign: TextAlign.center),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(12),
      child: TextField(
        controller: _controller,
        maxLines: null,
        expands: true,
        textAlignVertical: TextAlignVertical.top,
        decoration: const InputDecoration(border: OutlineInputBorder()),
      ),
    );
  }
}
