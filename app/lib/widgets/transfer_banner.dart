import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/ui/theme.dart';
import 'package:flutter/material.dart';

/// A strip pinned above the listing while files move: a determinate bar for
/// the current file, the `n/total · name · %` label, and a Cancel button
/// that aborts the current file and everything queued after it.
class TransferBanner extends StatelessWidget {
  /// Shows [progress]; [onCancel] fires when Cancel is tapped.
  const TransferBanner({
    required this.progress,
    required this.onCancel,
    super.key,
  });

  /// The transfer to describe.
  final TransferProgress progress;

  /// Aborts the batch.
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Raised via fill step, never a shadow (dark surfaces get no shadow).
    return Material(
      color: scheme.surfaceContainerHigh,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.xs,
          AppSpacing.sm,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    progress.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: AppTextSize.label),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    progress.detail,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: AppTextSize.caption,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                    child: LinearProgressIndicator(
                      value: progress.fraction,
                      minHeight: AppSpacing.sm,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            TextButton(onPressed: onCancel, child: const Text('Cancel')),
          ],
        ),
      ),
    );
  }
}
