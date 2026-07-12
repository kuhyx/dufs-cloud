import 'package:dufs_client/util/filter_sort.dart';
import 'package:dufs_client/widgets/extension_picker.dart';
import 'package:dufs_client/widgets/filter_sheet.dart';
import 'package:dufs_client/widgets/quantile_range_slider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final sizes = [for (var i = 0; i <= 100; i++) i * 1000000];
  final durations = [for (var i = 0; i <= 100; i++) i * 1000];

  Future<void> pump(
    WidgetTester tester, {
    required FilterState filter,
    required SortState sort,
    required void Function(FilterState) onFilter,
    required void Function(SortState) onSort,
    List<int>? durationValues,
  }) =>
      tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: FilterSheet(
            filter: filter,
            sort: sort,
            extensions: const ['jpg', 'png'],
            sizeValues: sizes,
            durationValues: durationValues ?? const [],
            onFilter: onFilter,
            onSort: onSort,
          ),
        ),
      ));

  testWidgets('edits type, extensions, size and sort', (tester) async {
    FilterState? f;
    SortState? s;
    await pump(tester,
        filter: defaultFilter,
        sort: defaultSort,
        onFilter: (v) => f = v,
        onSort: (v) => s = v);

    // Type dropdown (direct callback: covers both the value and null guards).
    final typeDd = tester.widget<DropdownButton<TypeFilter>>(
        find.byType(DropdownButton<TypeFilter>));
    typeDd.onChanged?.call(TypeFilter.video);
    expect(f?.type, TypeFilter.video);
    typeDd.onChanged?.call(null);

    // Extension chip cycles to include.
    await tester.tap(find.text('jpg'));
    expect(f?.extIncludes, ['jpg']);

    // Size slider reports a size bound.
    tester
        .widget<RangeSlider>(find.byType(RangeSlider))
        .onChanged
        ?.call(const RangeValues(0.2, 0.8));
    expect(f?.minSize, isNotNull);

    // Sort key + direction.
    final sortDd = tester
        .widget<DropdownButton<SortKey>>(find.byType(DropdownButton<SortKey>));
    sortDd.onChanged?.call(SortKey.size);
    expect(s?.key, SortKey.size);
    sortDd.onChanged?.call(null);
    await tester.tap(find.byTooltip('Ascending'));
    expect(s?.dir, SortDir.desc);
  });

  testWidgets('hides the extension picker for the folder type', (tester) async {
    await pump(tester,
        filter: defaultFilter.copyWith(type: TypeFilter.folder),
        sort: defaultSort,
        onFilter: (_) {},
        onSort: (_) {});
    expect(find.byType(ExtensionPicker), findsNothing);
  });

  testWidgets('shows a duration slider only for videos', (tester) async {
    FilterState? f;
    await pump(tester,
        filter: defaultFilter.copyWith(type: TypeFilter.video),
        sort: const SortState(dir: SortDir.desc),
        durationValues: durations,
        onFilter: (v) => f = v,
        onSort: (_) {});
    // Two sliders now: size (0) then duration (1).
    final sliders = tester.widgetList<QuantileRangeSlider>(
        find.byType(QuantileRangeSlider));
    expect(sliders.length, 2);
    tester
        .widgetList<RangeSlider>(find.byType(RangeSlider))
        .elementAt(1)
        .onChanged
        ?.call(const RangeValues(0.3, 0.6));
    expect(f?.minDurationMs, isNotNull);
    // Descending render covers the down-arrow branch.
    expect(find.byTooltip('Descending'), findsOneWidget);
  });
}
