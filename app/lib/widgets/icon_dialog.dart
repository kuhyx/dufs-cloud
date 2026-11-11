import 'package:flutter/material.dart';

/// The two dialog buttons: an outlined close (cancel) and a filled [confirm]
/// glyph. Labels are spoken only.
List<Widget> _actions(
  BuildContext ctx, {
  required IconData confirm,
  required String spoken,
  required VoidCallback onConfirm,
  Color? confirmColor,
}) => [
  TextButton(
    onPressed: () => Navigator.of(ctx).pop(),
    child: const Icon(Icons.close, semanticLabel: 'Cancel'),
  ),
  FilledButton(
    style: confirmColor == null
        ? null
        : FilledButton.styleFrom(backgroundColor: confirmColor),
    onPressed: onConfirm,
    child: Icon(confirm, semanticLabel: spoken),
  ),
];

/// Asks to confirm a destructive [icon] action on [subject] (a file name or
/// an item count: content). Resolves true only on the filled button.
Future<bool> confirmDestructive(
  BuildContext context, {
  required IconData icon,
  required String subject,
  required String spoken,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      final error = Theme.of(ctx).colorScheme.error;
      return AlertDialog(
        icon: Icon(icon, color: error, semanticLabel: spoken),
        title: Text(subject, textAlign: TextAlign.center),
        actions: _actions(
          ctx,
          confirm: Icons.delete_forever,
          spoken: spoken,
          confirmColor: error,
          onConfirm: () => Navigator.of(ctx).pop(true),
        ),
      );
    },
  );
  return ok ?? false;
}

/// Asks for a name: an [icon] header, a field prefilled with [initial] and a
/// check button. Resolves the trimmed text, or null when dismissed.
Future<String?> askName(
  BuildContext context, {
  required IconData icon,
  required String spoken,
  String initial = '',
}) {
  // Not disposed here: the field still paints during the exit animation.
  final controller = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      icon: Icon(icon, semanticLabel: spoken),
      content: TextField(
        controller: controller,
        autofocus: true,
        decoration: const InputDecoration(
          prefixIcon: Icon(Icons.drive_file_rename_outline),
        ),
        onSubmitted: (t) => Navigator.of(ctx).pop(t.trim()),
      ),
      actions: _actions(
        ctx,
        confirm: Icons.check,
        spoken: spoken,
        onConfirm: () => Navigator.of(ctx).pop(controller.text.trim()),
      ),
    ),
  );
}
