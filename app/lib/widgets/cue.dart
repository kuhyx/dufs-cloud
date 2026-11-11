import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// What happened, shown as a tinted glyph instead of a sentence.
enum CueKind {
  /// The action finished.
  success,

  /// The action failed.
  error,

  /// The user stopped the action.
  cancelled,
}

/// A status glyph: shape and colour differ per [kind], and [spoken] is the
/// screen-reader label (never painted).
class CueGlyph extends StatelessWidget {
  /// Creates the glyph for [kind].
  const CueGlyph({required this.kind, this.spoken, this.size = 24, super.key});

  /// Which outcome this shows.
  final CueKind kind;

  /// Screen-reader label, e.g. the old error sentence.
  final String? spoken;

  /// Icon size.
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (icon, color) = switch (kind) {
      CueKind.success => (Icons.check_circle, scheme.primary),
      CueKind.error => (Icons.error, scheme.error),
      CueKind.cancelled => (Icons.cancel, scheme.onSurfaceVariant),
    };
    return Icon(icon, color: color, size: size, semanticLabel: spoken);
  }
}

/// A full-area failure state: a large error glyph, plus [onRetry] as a
/// refresh button when the action can be repeated.
class ErrorState extends StatelessWidget {
  /// Creates the state; [spoken] carries the error for screen readers.
  const ErrorState({required this.spoken, this.onRetry, super.key});

  /// Screen-reader label (the error message).
  final String spoken;

  /// Retries the failed action, when there is one.
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CueGlyph(kind: CueKind.error, spoken: spoken, size: 48),
        if (onRetry != null)
          IconButton(
            icon: const Icon(Icons.refresh, semanticLabel: 'Retry'),
            onPressed: onRetry,
          ),
      ],
    ),
  );
}

/// Shows a snackbar holding a [CueGlyph], optional [detail] (content only:
/// file names, counts) and an optional icon [action]. Errors also buzz.
void showCue(
  BuildContext context,
  CueKind kind, {
  required String spoken,
  String? detail,
  Widget? action,
  Duration duration = const Duration(seconds: 4),
}) {
  if (kind == CueKind.error) HapticFeedback.heavyImpact().ignore();
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      duration: duration,
      content: Row(
        children: [
          CueGlyph(kind: kind, spoken: spoken),
          if (detail != null) ...[
            const SizedBox(width: 12),
            Expanded(
              child: Text(detail, maxLines: 2, overflow: TextOverflow.ellipsis),
            ),
          ] else
            const Spacer(),
          ?action,
        ],
      ),
    ),
  );
}
