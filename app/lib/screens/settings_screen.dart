import 'dart:async';

import 'package:dufs_client/services/settings.dart';
import 'package:flutter/material.dart';

/// Screen to enter and save the dufs URL, username and password.
class SettingsScreen extends StatefulWidget {
  /// Creates the settings screen backed by [settings].
  const SettingsScreen({required this.settings, super.key});

  /// The settings store to edit.
  final Settings settings;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _url;
  late final TextEditingController _user;
  final TextEditingController _pass = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _url = TextEditingController(
      text: widget.settings.baseUrl.isEmpty
          ? 'https://kuhy-cloud.duckdns.org'
          : widget.settings.baseUrl,
    );
    _user = TextEditingController(text: widget.settings.username);
    unawaited(
      widget.settings.password().then((p) {
        if (mounted) _pass.text = p;
      }),
    );
  }

  @override
  void dispose() {
    _url.dispose();
    _user.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    await widget.settings.save(
      baseUrl: _url.text,
      username: _user.text,
      password: _pass.text,
    );
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cloud settings')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _url,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(labelText: 'Server URL'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _user,
              decoration: const InputDecoration(labelText: 'Username'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _pass,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
