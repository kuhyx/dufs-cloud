import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/fake_webview_platform.dart';
import 'support/pdf_harness.dart';

void main() {
  late FakeWebViewPlatform fake;
  late Directory tempRoot;

  setUp(() async {
    fake = FakeWebViewPlatform();
    WebViewPlatform.instance = fake;
    tempRoot = await Directory.systemTemp.createTemp('pdf_screen_test_');
  });

  tearDown(() async {
    if (tempRoot.existsSync()) await tempRoot.delete(recursive: true);
  });

  testWidgets('extracts the viewer, downloads the file and loads it', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(home: pdfScreen(tempDir: () async => tempRoot)),
      );
      await pumpUntilSettled(tester);
    });

    expect(find.byType(WebViewWidget), findsOneWidget);
    expect(fake.lastLoadedUrl, isNotNull);
    expect(fake.lastLoadedUrl!.path, endsWith('/web/viewer.html'));
    expect(fake.lastLoadedUrl!.query, 'file=target.pdf');
    expect(File('${tempRoot.path}/pdfjs/web/viewer.html').existsSync(), isTrue);
    expect(File('${tempRoot.path}/pdfjs/web/target.pdf').readAsBytesSync(), [
      1,
      2,
      3,
    ]);
  });

  testWidgets('reuses an already-extracted viewer on a later open', (
    tester,
  ) async {
    late DateTime extractedAt;
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(home: pdfScreen(tempDir: () async => tempRoot)),
      );
      await pumpUntilSettled(tester);
      final marker = File('${tempRoot.path}/pdfjs/.extracted');
      expect(marker.existsSync(), isTrue);
      extractedAt = marker.statSync().modified;

      // Re-opening (e.g. a second PDF) must not re-extract.
      await tester.pumpWidget(
        MaterialApp(home: pdfScreen(tempDir: () async => tempRoot)),
      );
      await pumpUntilSettled(tester);
      expect(marker.statSync().modified, extractedAt);
    });
  });

  testWidgets('shows an error message when the download fails', (tester) async {
    final failing = pdfClient(MockClient((_) async => http.Response('', 500)));
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(
          home: pdfScreen(client: failing, tempDir: () async => tempRoot),
        ),
      );
      await pumpUntilSettled(tester);
    });
    expect(find.textContaining('Could not open'), findsOneWidget);
    expect(find.byType(WebViewWidget), findsNothing);
  });
}
