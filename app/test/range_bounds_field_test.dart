import 'package:dufs_client/widgets/range_bounds_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatBound', () {
    test('renders null as an empty field', () {
      expect(formatBound(null, bytesPerMb), '');
    });

    test('drops a trailing .0 so whole numbers read cleanly', () {
      expect(formatBound(500 * bytesPerMb, bytesPerMb), '500');
    });

    test('keeps one decimal place', () {
      expect(formatBound((1.5 * bytesPerMb).round(), bytesPerMb), '1.5');
    });

    test('rounds to whole units when decimals is 0', () {
      expect(formatBound(90_400, 1000, decimals: 0), '90');
    });

    test('converts megapixels', () {
      expect(formatBound(2 * pixelsPerMp, pixelsPerMp), '2');
    });
  });

  group('parseBound', () {
    test('an empty or blank field means no bound', () {
      expect(parseBound('', bytesPerMb), isNull);
      expect(parseBound('   ', bytesPerMb), isNull);
    });

    test('junk means no bound rather than an exception', () {
      expect(parseBound('abc', bytesPerMb), isNull);
      expect(parseBound('.', bytesPerMb), isNull);
    });

    test('negative input is rejected', () {
      expect(parseBound('-5', bytesPerMb), isNull);
    });

    test('scales into the underlying unit', () {
      expect(parseBound('500', bytesPerMb), 500 * bytesPerMb);
      expect(parseBound('90', 1000), 90000);
      expect(parseBound('2.5', pixelsPerMp), 2500000);
    });

    test('round-trips with formatBound', () {
      final bytes = parseBound('12.5', bytesPerMb);
      expect(formatBound(bytes, bytesPerMb), '12.5');
    });
  });

  group('RangeBoundsField', () {
    Future<List<(int?, int?)>> pumpAndEdit(
      WidgetTester tester, {
      required String field,
      required String text,
      int? lo,
      int? hi,
    }) async {
      final edits = <(int?, int?)>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RangeBoundsField(
              lo: lo,
              hi: hi,
              perUnit: bytesPerMb,
              unit: 'MB',
              onChanged: (l, h) => edits.add((l, h)),
            ),
          ),
        ),
      );
      await tester.enterText(find.widgetWithText(TextField, field), text);
      await tester.pump();
      return edits;
    }

    testWidgets('shows a min and a max field labelled with the unit',
        (tester) async {
      await pumpAndEdit(tester, field: 'min MB', text: '');
      expect(find.widgetWithText(TextField, 'min MB'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'max MB'), findsOneWidget);
    });

    testWidgets('typing a minimum reports it in bytes', (tester) async {
      final edits = await pumpAndEdit(tester, field: 'min MB', text: '500');
      expect(edits.last, (500 * bytesPerMb, null));
    });

    testWidgets('typing a maximum keeps the existing minimum', (tester) async {
      final edits = await pumpAndEdit(
        tester,
        field: 'max MB',
        text: '900',
        lo: 100 * bytesPerMb,
      );
      expect(edits.last, (100 * bytesPerMb, 900 * bytesPerMb));
    });

    testWidgets('clearing a field removes that bound', (tester) async {
      final edits = await pumpAndEdit(
        tester,
        field: 'min MB',
        text: '',
        lo: 500 * bytesPerMb,
      );
      expect(edits.last, (null, null));
    });

    testWidgets('rejects letters at the keyboard', (tester) async {
      final edits = await pumpAndEdit(tester, field: 'min MB', text: '12ab3');
      expect(edits.last, (123 * bytesPerMb, null));
    });

    testWidgets('a decimal survives being typed one key at a time',
        (tester) async {
      // Regression: FilterSheet is fully controlled, so the parent echoes every
      // keystroke back into `lo`. Reformatting "1." to "1" mid-edit ate the
      // decimal point and the following digit landed in the wrong column,
      // turning a typed 1.5 MB into a silent 15 MB bound.
      int? lo;
      Widget build() => MaterialApp(
            home: Scaffold(
              body: StatefulBuilder(
                builder: (context, setState) => RangeBoundsField(
                  lo: lo,
                  hi: null,
                  perUnit: bytesPerMb,
                  unit: 'MB',
                  onChanged: (l, h) => setState(() => lo = l),
                ),
              ),
            ),
          );
      await tester.pumpWidget(build());
      final field = find.widgetWithText(TextField, 'min MB');

      for (final key in ['1', '.', '5']) {
        final current = tester.widget<TextField>(field).controller!.text;
        await tester.enterText(field, '$current$key');
        await tester.pump();
      }

      expect(tester.widget<TextField>(field).controller!.text, '1.5');
      expect(lo, (1.5 * bytesPerMb).round());
    });

    testWidgets('a slider move updates the text without an edit loop',
        (tester) async {
      final edits = <(int?, int?)>[];
      Widget build(int? lo) => MaterialApp(
            home: Scaffold(
              body: RangeBoundsField(
                lo: lo,
                hi: null,
                perUnit: bytesPerMb,
                unit: 'MB',
                onChanged: (l, h) => edits.add((l, h)),
              ),
            ),
          );

      await tester.pumpWidget(build(null));
      await tester.pumpWidget(build(250 * bytesPerMb));
      await tester.pump();

      expect(find.widgetWithText(TextField, '250'), findsOneWidget);
      // Syncing the controller must not look like the user typing.
      expect(edits, isEmpty);
    });
  });
}
