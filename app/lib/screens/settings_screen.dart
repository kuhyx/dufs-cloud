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
  late bool _cue = widget.settings.completionSound;

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
      // The gear that opened this screen names it; no title.
      appBar: AppBar(),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _field(Icons.link, 'Server URL', _url, url: true),
            const SizedBox(height: 12),
            _field(Icons.person, 'Username', _user),
            const SizedBox(height: 12),
            _field(Icons.lock, 'Password', _pass, obscure: true),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Align(
                alignment: Alignment.centerLeft,
                child: Icon(Icons.volume_up, semanticLabel: 'Completion sound'),
              ),
              value: _cue,
              onChanged: (v) {
                setState(() => _cue = v);
                unawaited(widget.settings.setCompletionSound(enabled: v));
              },
            ),
            const SizedBox(height: 24),
            FilledButton(
              key: const Key('save'),
              onPressed: _saving ? null : _save,
              child: const Icon(Icons.check, semanticLabel: 'Save'),
            ),
          ],
        ),
      ),
    );
  }

  /// A field named by its prefix glyph; [spoken] is the screen-reader label.
  Widget _field(
    IconData icon,
    String spoken,
    TextEditingController controller, {
    bool url = false,
    bool obscure = false,
  }) => Semantics(
    label: spoken,
    child: TextField(
      controller: controller,
      keyboardType: url ? TextInputType.url : null,
      obscureText: obscure,
      decoration: InputDecoration(prefixIcon: Icon(icon)),
    ),
  );
}
