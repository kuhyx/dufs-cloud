import 'package:dufs_client/widgets/extension_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('cycles off → include → exclude → off', (tester) async {
    List<String>? inc;
    List<String>? exc;
    Widget host(List<String> includes, List<String> excludes) => MaterialApp(
          home: Scaffold(
            body: ExtensionPicker(
              available: const ['jpg', 'png'],
              includes: includes,
              excludes: excludes,
              onChanged: (i, e) {
                inc = i;
                exc = e;
              },
            ),
          ),
        );

    await tester.pumpWidget(host(const [], const []));
    await tester.tap(find.text('jpg'));
    expect(inc, ['jpg']);
    expect(exc, isEmpty);

    await tester.pumpWidget(host(const ['jpg'], const []));
    await tester.tap(find.text('jpg'));
    expect(inc, isEmpty);
    expect(exc, ['jpg']);

    await tester.pumpWidget(host(const [], const ['jpg']));
    await tester.tap(find.text('jpg'));
    expect(inc, isEmpty);
    expect(exc, isEmpty);
  });

  testWidgets('shows a hint when there are no extensions', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: ExtensionPicker(
          available: [],
          includes: [],
          excludes: [],
          onChanged: _noop,
        ),
      ),
    ));
    expect(find.text('No extensions in view.'), findsOneWidget);
  });
}

void _noop(List<String> a, List<String> b) {}
