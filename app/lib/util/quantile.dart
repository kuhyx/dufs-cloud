/// Distribution-aware (quantile) scale for the size and duration sliders, so
/// the middle of a track is the MEDIAN of the data — not the arithmetic
/// midpoint, which an outlier can push far above where most items sit.
///
/// Ported from the web app's `src/lib/quantile.ts`.
library;

/// Bounds-checked list access (callers guarantee the index is valid).
int nth(List<int> values, int index) {
  if (index < 0 || index >= values.length) {
    throw RangeError('index $index out of range');
  }
  return values[index];
}

/// Clamps [x] to the unit interval.
double clamp01(double x) => x < 0 ? 0 : (x > 1 ? 1 : x);

/// The value at quantile [f] (0..1) of an ascending, non-empty list, with
/// linear interpolation between the two straddling samples. `f = 0.5` returns
/// the median. Empty input yields 0 (callers hide the slider in that case).
int quantileValue(List<int> sorted, double f) {
  final n = sorted.length;
  if (n == 0) return 0;
  final pos = clamp01(f) * (n - 1);
  final lo = pos.floor();
  final hi = pos.ceil();
  final a = nth(sorted, lo);
  final b = nth(sorted, hi);
  return (a + (b - a) * (pos - lo)).round();
}

/// The quantile (0..1) of [value] within [sorted] — the inverse of
/// [quantileValue], used to place a thumb on the track. Values at or beyond the
/// ends map to 0/1.
double valueQuantile(List<int> sorted, int value) {
  final n = sorted.length;
  if (n <= 1) return 0;
  if (value <= nth(sorted, 0)) return 0;
  if (value >= nth(sorted, n - 1)) return 1;
  // value strictly inside the range, so there is an index hi >= 1 with
  // sorted[hi] >= value and sorted[hi - 1] < value.
  final hi = sorted.indexWhere((v) => v >= value);
  final lo = hi - 1;
  final a = nth(sorted, lo);
  final b = nth(sorted, hi);
  // a < value <= b here, so b - a > 0 (no divide-by-zero).
  return (lo + (value - a) / (b - a)) / (n - 1);
}
