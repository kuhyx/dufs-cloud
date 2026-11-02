import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

/// Placeholder tiles shown while a folder listing loads: the same 3-column
/// card grid as the real listing, filled with static neutral blocks. No
/// shimmer, no progress cue: it only reserves the layout.
class ListingSkeleton extends StatelessWidget {
  /// Creates the skeleton grid.
  const ListingSkeleton({super.key});

  static const int _count = 12;

  @override
  Widget build(BuildContext context) {
    final block = Theme.of(context).colorScheme.surfaceContainerHighest;
    return ExcludeSemantics(
      child: GridView.count(
        physics: const NeverScrollableScrollPhysics(),
        crossAxisCount: 3,
        padding: const EdgeInsets.all(AppSpacing.sm),
        mainAxisSpacing: AppSpacing.sm,
        crossAxisSpacing: AppSpacing.sm,
        childAspectRatio: 0.82,
        children: [for (var i = 0; i < _count; i++) _tile(block)],
      ),
    );
  }

  Widget _tile(Color block) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(child: ColoredBox(color: block)),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.xs),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: 0.6,
                child: SizedBox(height: AppSpacing.md, child: _bar(block)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bar(Color block) => DecoratedBox(
    decoration: BoxDecoration(
      color: block,
      borderRadius: BorderRadius.circular(AppSpacing.xs),
    ),
  );
}
