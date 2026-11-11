import 'dart:convert';

import 'package:dufs_client/models/upload_source.dart';
import 'package:dufs_client/widgets/cue.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/browser_harness.dart';
import 'support/browser_mocks.dart';
import 'support/fake_webview_platform.dart';
import 'support/finders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // BrowserScreen pushes a real VideoScreen, which builds a MediaKitPlayer
  // (libmpv) rather than a fake — so the native library has to be loaded here
  // exactly as main.dart does it.
  MediaKit.ensureInitialized();

  setUp(() {
    WebViewPlatform.instance = FakeWebViewPlatform();
  });

  testWidgets('uploads every picked file, then a cancelled pick', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final puts = <String>[];
    final bodies = <String, List<int>>{};
    final mock = MockClient.streaming((req, body) async {
      if (req.method == 'PUT') {
        puts.add(req.url.path);
        bodies[req.url.path] = await body.expand((c) => c).toList();
      }
      if (req.method == 'PROPFIND') {
        return http.StreamedResponse(
          Stream.value(utf8.encode(listingXml(rootListing))),
          207,
        );
      }
      return http.StreamedResponse(const Stream.empty(), 201);
    });
    var files = [
      uploadSource('up.png', [1, 2, 3]),
      uploadSource('note.txt', [4]),
    ];
    await tester.pumpWidget(
      browserApp(settings, mock, pick: () async => files),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();
    expect(puts, ['/up.png', '/note.txt']);
    expect(bodies['/up.png'], [1, 2, 3]);
    expect(spoken('Uploaded 2'), findsOneWidget);

    // Cancelled pick returns nothing and uploads nothing further.
    files = [];
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 100));
    });
    await tester.pumpAndSettle();
    expect(puts.length, 2);
  });

  testWidgets('one failed upload does not abort the batch and is named', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final mock = MockClient((req) async {
      if (req.method == 'PUT' && req.url.path == '/bad.bin') {
        return http.Response('', 500);
      }
      if (req.method == 'PROPFIND') {
        return http.Response(listingXml(rootListing), 207);
      }
      return http.Response('', 201);
    });
    await tester.pumpWidget(
      browserApp(
        settings,
        mock,
        pick: () async => [
          uploadSource('a.png', [1]),
          uploadSource('bad.bin', [2]),
          uploadSource('c.png', [3]),
        ],
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(find.text('1/3 · bad.bin'), findsOneWidget);
    expect(cueOf(CueKind.error), findsOneWidget);
  });

  testWidgets('a single upload reports in the singular', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(
      browserApp(
        settings,
        browserMock(),
        pick: () async => [
          uploadSource('a.png', [1]),
        ],
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(spoken('Uploaded 1'), findsOneWidget);
  });

  // Cancels a two-file batch during the first (slow) file. With [deleteFail]
  // the server refuses to remove the partial, which must not change the
  // outcome the user sees.
  Future<void> cancelUpload(
    WidgetTester tester, {
    required bool deleteFail,
  }) async {
    final settings = await testSettings(configured: true);
    final methods = <String>[];
    final mock = MockClient.streaming((req, body) async {
      methods.add('${req.method} ${req.url.path}');
      if (req.method == 'PROPFIND') {
        return http.StreamedResponse(
          Stream.value(utf8.encode(listingXml(rootListing))),
          207,
        );
      }
      if (req.method == 'DELETE' && deleteFail) {
        return http.StreamedResponse(const Stream.empty(), 500);
      }
      await body.drain<void>();
      return http.StreamedResponse(const Stream.empty(), 201);
    });
    Stream<List<int>> slow() async* {
      for (var i = 0; i < 60; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
        yield [i];
      }
    }

    await tester.pumpWidget(
      browserApp(
        settings,
        mock,
        pick: () async => [
          UploadSource(name: 'slow.bin', size: 60, open: slow),
          uploadSource('never.bin', [1]),
        ],
      ),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 150));
    });
    await tester.pump();
    expect(find.text('1/2 · slow.bin'), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(spoken('Cancel'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(spoken('Cancelled after 0 of 2'), findsOneWidget);
    expect(methods, contains('DELETE /slow.bin'));
    expect(methods, isNot(contains('PUT /never.bin')));
    await tester.pump(const Duration(seconds: 5));
  }

  testWidgets(
    'cancelling an upload stops the batch and removes the partial',
    (tester) => cancelUpload(tester, deleteFail: false),
  );

  testWidgets(
    'a partial that cannot be removed still reads as cancelled',
    (tester) => cancelUpload(tester, deleteFail: true),
  );

  testWidgets('upload error shows a snackbar', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(
      browserApp(
        settings,
        browserMock(uploadFail: true),
        pick: () async => [
          uploadSource('u.png', [1]),
        ],
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(find.text('1/1 · u.png'), findsOneWidget);
    expect(cueOf(CueKind.error), findsOneWidget);
  });
}
