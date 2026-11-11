import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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

  testWidgets('tapping a non-media, non-text file saves it to Download/ '
      'and offers to open it', (tester) async {
    // It used to write the file into app-private storage and say so, which
    // named a location no file manager can open. Now the bytes are staged in
    // the temp dir, moved into the public Download/ collection, and the toast
    // names the spot MediaStore actually chose (renamed on collision).
    final settings = await testSettings(configured: true);
    final downloads = FakeDownloads();
    await tester.pumpWidget(
      browserApp(settings, browserMock(), tmp: tmpDir, downloads: downloads),
    );
    await tester.pumpAndSettle();
    // The download does real temp-file I/O, so drive it in the real zone.
    await tester.runAsync(() async {
      await tester.tap(find.text('data.bin'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(downloads.staged.single, endsWith('data.bin'));
    expect(File(downloads.staged.single).readAsBytesSync(), [1, 2, 3]);
    expect(spoken('Saved to Download/data.bin (1)'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1)); // snackbar slides in
    await tester.tap(spoken('Open'));
    await tester.pumpAndSettle();
    expect(downloads.opened.single.name, 'data.bin (1)');
    expect(spokenContaining('No app can open'), findsNothing);
  });

  testWidgets('Open with no viewer says so', (tester) async {
    final settings = await testSettings(configured: true);
    final downloads = FakeDownloads(openOk: false);
    await tester.pumpWidget(
      browserApp(settings, browserMock(), tmp: tmpDir, downloads: downloads),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.text('data.bin'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    await tester.pump(const Duration(seconds: 1)); // snackbar slides in
    await tester.tap(spoken('Open'));
    await tester.pumpAndSettle();
    expect(spoken('No app can open data.bin (1)'), findsOneWidget);
  });

  testWidgets('a MediaStore failure is a download failure', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(
      browserApp(
        settings,
        browserMock(),
        tmp: tmpDir,
        downloads: FakeDownloads(failSave: true),
      ),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.text('data.bin'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(spokenContaining('Download failed'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('a download shows progress and can be cancelled', (tester) async {
    final settings = await testSettings(configured: true);
    final downloads = FakeDownloads();
    // Sync: an awaited real I/O future never completes in the fake zone.
    final tmp = Directory.systemTemp.createTempSync('dufs_test');
    await tester.pumpWidget(
      browserApp(
        settings,
        slowGetMock(),
        tmp: () async => tmp,
        downloads: downloads,
      ),
    );
    await tester.pumpAndSettle();
    // pump() must stay outside runAsync, so the cancel is a second block;
    // the body keeps dribbling in real time in between.
    await tester.runAsync(() async {
      await tester.tap(find.text('data.bin'));
      await Future<void>.delayed(const Duration(milliseconds: 150));
    });
    await tester.pump();
    expect(find.text('1/1 · data.bin'), findsOneWidget);
    expect(find.textContaining('% · '), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(spoken('Cancel'));
    });
    // Poll in real time: under a loaded full-suite run the abort and the
    // staging-file cleanup can take longer than any fixed delay.
    for (
      var i = 0;
      i < 50 && spoken('Download cancelled').evaluate().isEmpty;
      i++
    ) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump();
    }
    expect(spoken('Download cancelled'), findsOneWidget);
    expect(spoken('Cancel'), findsNothing);
    expect(downloads.staged, isEmpty);
    // The half-written staging file is gone, so nothing partial lingers.
    expect(tmp.listSync(), isEmpty);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('tapping a text file opens the editor', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('doc.txt'));
    await tester.pumpAndSettle();
    // The editor screen shows a Save action.
    expect(spoken('Save'), findsOneWidget);
  });

  testWidgets('download via the popup menu, and a download error', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(
      browserApp(settings, browserMock(downloadFail: true), tmp: tmpDir),
    );
    await tester.pumpAndSettle();
    // The last tile is a file (folders sort first); open its menu.
    await tester.tap(find.byIcon(Icons.more_vert).last);
    await tester.pumpAndSettle();
    await tester.tap(spoken('Download'));
    await tester.pump();
    // Staging dir, sink close and partial delete are all real I/O.
    await settleIo(tester);
    expect(spokenContaining('Download failed'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });
}
