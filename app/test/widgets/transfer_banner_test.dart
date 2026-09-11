import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/widgets/transfer_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows both lines, a determinate bar, and fires Cancel',
      (tester) async {
    var cancelled = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TransferBanner(
          progress: const TransferProgress(
            kind: TransferKind.upload,
            index: 2,
            total: 5,
            name: 'clip.mp4',
            done: 50,
            size: 200,
          ),
          onCancel: () => cancelled++,
        ),
      ),
    ));
    expect(find.text('Uploading 2/5 · clip.mp4'), findsOneWidget);
    expect(find.text('25 % · 50 B / 200 B'), findsOneWidget);
    final bar = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    expect(bar.value, 0.25);
    await tester.tap(find.text('Cancel'));
    expect(cancelled, 1);
  });

  testWidgets('an unknown size renders an indeterminate bar', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TransferBanner(
          progress: const TransferProgress(
            kind: TransferKind.download,
            index: 1,
            total: 1,
            name: 'x',
            done: 7,
            size: 0,
          ),
          onCancel: () {},
        ),
      ),
    ));
    final bar = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    expect(bar.value, isNull);
    expect(find.text('7 B'), findsOneWidget);
  });
}
