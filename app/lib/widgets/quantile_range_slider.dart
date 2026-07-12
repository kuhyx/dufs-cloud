import 'package:dufs_client/util/quantile.dart';
import 'package:flutter/material.dart';

/// A dual-thumb range slider whose scale follows the *distribution* of [values]
/// (quantile-mapped), so the middle of the track is the median — not the
/// arithmetic midpoint, which an outlier can push far above where most items
/// sit. Fully controlled; pushing a thumb to a bound clears that side (null),
/// so "full range" means "no filter". Callers show it only when [values] holds
/// at least two distinct numbers.
class QuantileRangeSlider extends StatelessWidget {
  /// Creates the slider over the ascending distribution [values].
  const QuantileRangeSlider({
    required this.values,
    required this.lo,
    required this.hi,
    required this.onChanged,
    required this.labelOf,
    super.key,
  });

  /// The ascending distribution the track is scaled to (>= 2 distinct values).
  final List<int> values;

  /// Current lower bound, or null when unset (defaults to the minimum).
  final int? lo;

  /// Current upper bound, or null when unset (defaults to the maximum).
  final int? hi;

  /// Reports the new bounds; a value at the extreme is reported as null.
  final void Function(int? lo, int? hi) onChanged;

  /// Formats a raw value for the range label (e.g. human size or duration).
  final String Function(int) labelOf;

  @override
  Widget build(BuildContext context) {
    final min = values.first;
    final max = values.last;
    final loVal = lo ?? min;
    final hiVal = hi ?? max;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RangeSlider(
          values: RangeValues(
            valueQuantile(values, loVal),
            valueQuantile(values, hiVal),
          ),
          onChanged: (rv) {
            final newLo = quantileValue(values, rv.start);
            final newHi = quantileValue(values, rv.end);
            onChanged(newLo <= min ? null : newLo, newHi >= max ? null : newHi);
          },
        ),
        Text(
          '${labelOf(loVal)} – ${labelOf(hiVal)}',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}
