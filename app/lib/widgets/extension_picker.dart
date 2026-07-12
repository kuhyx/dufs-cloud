import 'package:flutter/material.dart';

/// A tri-state extension filter shown as tappable chips. Each extension cycles
/// on tap: off → keep (✓) → drop (✕) → off. This surfaces every available
/// extension at once (unlike a dropdown) and lets several be kept and others
/// banned at the same time. Fully controlled via [includes]/[excludes].
class ExtensionPicker extends StatelessWidget {
  /// Creates the picker over the [available] extensions.
  const ExtensionPicker({
    required this.available,
    required this.includes,
    required this.excludes,
    required this.onChanged,
    super.key,
  });

  /// Extensions present in scope (the chips).
  final List<String> available;

  /// Extensions currently kept (allowlist).
  final List<String> includes;

  /// Extensions currently dropped (denylist).
  final List<String> excludes;

  /// Reports the new allow/deny lists after a chip is cycled.
  final void Function(List<String> includes, List<String> excludes) onChanged;

  void _cycle(String ext) {
    final inc = [...includes]..remove(ext);
    final exc = [...excludes]..remove(ext);
    if (includes.contains(ext)) {
      exc.add(ext);
    } else if (!excludes.contains(ext)) {
      inc.add(ext);
    }
    onChanged(inc, exc);
  }

  @override
  Widget build(BuildContext context) {
    if (available.isEmpty) {
      return const Text('No extensions in view.');
    }
    final scheme = Theme.of(context).colorScheme;
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        for (final ext in available)
          _chip(ext, includes.contains(ext), excludes.contains(ext), scheme),
      ],
    );
  }

  Widget _chip(String ext, bool included, bool excluded, ColorScheme scheme) {
    return ActionChip(
      avatar: included
          ? Icon(Icons.check, size: 18, color: scheme.primary)
          : excluded
              ? Icon(Icons.close, size: 18, color: scheme.error)
              : null,
      label: Text(ext),
      backgroundColor: excluded
          ? scheme.errorContainer
          : included
              ? scheme.primaryContainer
              : null,
      onPressed: () => _cycle(ext),
    );
  }
}
