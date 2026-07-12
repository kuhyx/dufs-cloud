import 'package:dufs_client/util/quantile.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('nth', () {
    test('returns the element at an in-bounds index', () {
      expect(nth([10, 20, 30], 1), 20);
    });
    test('throws for an out-of-bounds index', () {
      expect(() => nth([], 0), throwsRangeError);
      expect(() => nth([1], -1), throwsRangeError);
    });
  });

  group('clamp01', () {
    test('clamps to the unit interval', () {
      expect(clamp01(-1), 0);
      expect(clamp01(2), 1);
      expect(clamp01(0.25), 0.25);
    });
  });

  group('quantileValue', () {
    test('empty distribution yields 0', () {
      expect(quantileValue([], 0.5), 0);
    });
    test('single element for any fraction', () {
      expect(quantileValue([7], 0.9), 7);
    });
    test('interpolates between straddling samples', () {
      expect(quantileValue([0, 10, 20, 30], 0.5), 15);
    });
    test('clamps the fraction to the ends', () {
      expect(quantileValue([0, 10, 20, 30], 2), 30);
      expect(quantileValue([0, 10, 20, 30], -1), 0);
    });
    test('distribution-aware: median of a lopsided set is mid-track', () {
      final skewed = [...List<int>.filled(99, 2), 1000]..sort();
      expect(quantileValue(skewed, 0.5), lessThan(5));
    });
  });

  group('valueQuantile', () {
    test('degenerate (<=1 element) yields 0', () {
      expect(valueQuantile([5], 5), 0);
    });
    test('maps the ends to 0 and 1', () {
      expect(valueQuantile([0, 10, 20], -5), 0);
      expect(valueQuantile([0, 10, 20], 50), 1);
    });
    test('inverts quantileValue for an interior value', () {
      expect(valueQuantile([0, 10, 20], 10), 0.5);
    });
  });
}
