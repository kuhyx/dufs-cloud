import 'dart:convert';

import 'package:dufs_client/services/completion_cue.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/browser_harness.dart';
import 'support/browser_mocks.dart';
import 'support/fake_webview_platform.dart';

/// A cue whose clock jumps 3 s per read, so every run looks long.
CompletionCue _longRunCue(List<String> played) {
  var t = DateTime(2026);
  return CompletionCue(
    enabled: () => true,
    play: () async => played.add('cue'),
    now: () => t = t.add(const Duration(seconds: 3)),
  );
}

MockClient _putMock({required int putStatus}) =>
    MockClient.streaming((req, body) async {
      await body.drain<void>();
      if (req.method == 'PROPFIND') {
        return http.StreamedResponse(
          Stream.value(utf8.encode(listingXml(rootListing))),
          207,
        );
      }
      return http.StreamedResponse(const Stream.empty(), putStatus);
    });

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();

  setUp(() {
    WebViewPlatform.instance = FakeWebViewPlatform();
  });

  testWidgets('a long upload that succeeds plays the cue', (tester) async {
    final settings = await testSettings(configured: true);
    final played = <String>[];
    await tester.pumpWidget(
      browserApp(
        settings,
        _putMock(putStatus: 201),
        pick: () async => [
          uploadSource('a.txt', [1]),
        ],
        cue: _longRunCue(played),
      ),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();
    expect(find.text('Uploaded 1 file'), findsOneWidget);
    expect(played, ['cue']);
  });

  testWidgets('an upload with a failed file does not play the cue', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final played = <String>[];
    await tester.pumpWidget(
      browserApp(
        settings,
        _putMock(putStatus: 500),
        pick: () async => [
          uploadSource('a.txt', [1]),
        ],
        cue: _longRunCue(played),
      ),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();
    expect(find.textContaining('failed'), findsOneWidget);
    expect(played, isEmpty);
  });

  testWidgets('a cancelled index does not play the cue', (tester) async {
    final settings = await testSettings(configured: true);
    final played = <String>[];
    Future<void> slowList() =>
        Future<void>.delayed(const Duration(milliseconds: 200));
    final mock = MockClient((req) async {
      if (req.method != 'PROPFIND') return http.Response.bytes([1], 200);
      await slowList();
      final items = req.url.path == '/Sub'
          ? const <(String, bool, int)>[]
          : rootListing;
      return http.Response(listingXml(items), 207);
    });
    await tester.pumpWidget(
      browserApp(settings, mock, cue: _longRunCue(played)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'pic');
    await tester.pump(const Duration(milliseconds: 250));
    await tester.tap(find.bySemanticsLabel('Cancel indexing'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Partial index'), findsOneWidget);
    expect(played, isEmpty);
  });

  testWidgets('a finished index plays the cue', (tester) async {
    final settings = await testSettings(configured: true);
    final played = <String>[];
    await tester.pumpWidget(
      browserApp(
        settings,
        MockClient((req) async {
          if (req.method != 'PROPFIND') return http.Response.bytes([1], 200);
          final items = req.url.path == '/Sub'
              ? const <(String, bool, int)>[]
              : rootListing;
          return http.Response(listingXml(items), 207);
        }),
        cue: _longRunCue(played),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'pic');
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
    expect(played, ['cue']);
  });

  testWidgets('a zip that lands plays the cue; a failed one does not', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final played = <String>[];
    await tester.pumpWidget(
      browserApp(
        settings,
        browserMock(),
        tmp: tmpDir,
        downloads: FakeDownloads(),
        cue: _longRunCue(played),
      ),
    );
    await tester.pumpAndSettle();
    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.runAsync(() async {
      await tester.tap(find.byTooltip('Download zip'));
      await Future<void>.delayed(const Duration(milliseconds: 400));
    });
    await tester.pump();
    expect(find.textContaining('Saved to'), findsOneWidget);
    expect(played, ['cue']);
    await tester.pump(const Duration(seconds: 9));
  });

  testWidgets('a failed zip does not play the cue', (tester) async {
    final settings = await testSettings(configured: true);
    final played = <String>[];
    await tester.pumpWidget(
      browserApp(
        settings,
        browserMock(downloadFail: true),
        tmp: tmpDir,
        downloads: FakeDownloads(),
        cue: _longRunCue(played),
      ),
    );
    await tester.pumpAndSettle();
    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.runAsync(() async {
      await tester.tap(find.byTooltip('Download zip'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(find.textContaining('Zip failed'), findsOneWidget);
    expect(played, isEmpty);
    await tester.pump(const Duration(seconds: 5));
  });
}
