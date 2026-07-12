import 'package:dufs_client/widgets/quantile_range_slider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final uniform = [for (var i = 0; i <= 100; i++) i];

  Widget host({
    required void Function(int?, int?) onChanged,
    int? lo,
    int? hi,
  }) =>
      MaterialApp(
        home: Scaffold(
          body: QuantileRangeSlider(
            values: uniform,
            lo: lo,
            hi: hi,
            onChanged: onChanged,
            labelOf: (v) => '$v',
          ),
        ),
      );

  testWidgets('maps fractions to bounds and clears at the extremes',
      (tester) async {
    int? capturedLo;
    int? capturedHi;
    var calls = 0;
    await tester.pumpWidget(host(onChanged: (lo, hi) {
      capturedLo = lo;
      capturedHi = hi;
      calls++;
    }));
    // Defaulted range label (lo/hi null → min/max).
    expect(find.text('0 – 100'), findsOneWidget);
    final slider = tester.widget<RangeSlider>(find.byType(RangeSlider));
    // Full range → both cleared.
    slider.onChanged?.call(const RangeValues(0, 1));
    expect([capturedLo, capturedHi], [null, null]);
    // Mid fractions → real bounds (uniform ⇒ quantile ≈ linear).
    slider.onChanged?.call(const RangeValues(0.3, 0.7));
    expect([capturedLo, capturedHi], [30, 70]);
    expect(calls, 2);
  });

  testWidgets('labels reflect explicit bounds', (tester) async {
    await tester.pumpWidget(host(lo: 20, hi: 80, onChanged: (_, _) {}));
    expect(find.text('20 – 80'), findsOneWidget);
  });
}
