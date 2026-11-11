import 'package:dufs_client/widgets/folder_picker.dart';
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

  testWidgets('bulk delete: confirm deletes each item; cancel does not', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final methods = <String>[];
    final mock = MockClient((req) async {
      methods.add(req.method);
      if (req.method == 'DELETE') return http.Response('', 204);
      return http.Response(listingXml(rootListing), 207);
    });
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.tap(find.text('doc.txt'));
    await tester.pump();

    // Cancel the confirmation: no DELETE.
    await tester.tap(spoken('Delete'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AlertDialog, '2'), findsOneWidget);
    await tester.tap(spoken('Cancel'));
    await tester.pumpAndSettle();
    expect(methods.where((m) => m == 'DELETE'), isEmpty);

    // Confirm: one DELETE per selected item.
    await tester.tap(spoken('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FilledButton).last);
    await tester.pumpAndSettle();
    expect(methods.where((m) => m == 'DELETE').length, 2);
    expect(find.widgetWithText(AppBar, '2'), findsNothing); // selection cleared
  });

  testWidgets('bulk delete surfaces a failure count', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(
      browserApp(settings, browserMock(deleteFail: true)),
    );
    await tester.pumpAndSettle();
    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.tap(spoken('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FilledButton).last);
    await tester.pumpAndSettle();
    expect(spokenContaining('could not be deleted'), findsOneWidget);
  });

  testWidgets(
    'bulk move: pick a folder, cancel, and a no-op into the same dir',
    (tester) async {
      final settings = await testSettings(configured: true);
      final methods = <String>[];
      final mock = MockClient((req) async {
        methods.add(req.method);
        if (req.method == 'MOVE') return http.Response('', 201);
        if (req.url.path == '/Sub') return http.Response(listingXml([]), 207);
        return http.Response(listingXml(rootListing), 207);
      });
      await tester.pumpWidget(browserApp(settings, mock));
      await tester.pumpAndSettle();

      Future<void> startMove() async {
        await tester.longPress(find.text('data.bin'));
        await tester.pump();
        await tester.tap(spoken('Move'));
        await tester.pumpAndSettle();
      }

      // Cancel the picker (system back): no MOVE.
      await startMove();
      expect(find.byType(FolderPicker), findsOneWidget);
      await tester.tap(find.backButton());
      await tester.pumpAndSettle();
      expect(methods.where((m) => m == 'MOVE'), isEmpty);

      // "Move here" at the starting folder is a no-op (dest == current path).
      await startMove();
      await tester.tap(find.byType(FilledButton).last);
      await tester.pumpAndSettle();
      expect(methods.where((m) => m == 'MOVE'), isEmpty);

      // Descend into /Sub and move there: one MOVE.
      await startMove();
      await tester.tap(find.text('Sub'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(FilledButton).last);
      await tester.pumpAndSettle();
      expect(methods.where((m) => m == 'MOVE').length, 1);
    },
  );

  testWidgets('download selected as a zip lands in Download/', (tester) async {
    final settings = await testSettings(configured: true);
    final downloads = FakeDownloads();
    await tester.pumpWidget(
      browserApp(settings, browserMock(), tmp: tmpDir, downloads: downloads),
    );
    await tester.pumpAndSettle();

    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    // Real file I/O (download + temp write), so drive it in the real zone and
    // pump manually afterwards (pumpAndSettle would hang on the async gap).
    await tester.runAsync(() async {
      await tester.tap(spoken('Download zip'));
      await Future<void>.delayed(const Duration(milliseconds: 400));
    });
    await tester.pump();
    expect(downloads.staged.single, endsWith('dufs-selection.zip'));
    expect(
      spoken('Saved to Download/dufs-selection.zip (1)'),
      findsOneWidget,
    );
    expect(find.widgetWithText(AppBar, '1'), findsNothing); // selection cleared
  });

  testWidgets('a zip download can be cancelled mid-file', (tester) async {
    final settings = await testSettings(configured: true);
    final downloads = FakeDownloads();
    await tester.pumpWidget(
      browserApp(settings, slowGetMock(), tmp: tmpDir, downloads: downloads),
    );
    await tester.pumpAndSettle();
    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.runAsync(() async {
      await tester.tap(spoken('Download zip'));
      await Future<void>.delayed(const Duration(milliseconds: 150));
    });
    await tester.pump();
    expect(find.text('1/1 · data.bin'), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(spoken('Cancel'));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pump();
    expect(spoken('Zip cancelled'), findsOneWidget);
    expect(downloads.staged, isEmpty);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('a zip build failure shows a snackbar', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(
      browserApp(
        settings,
        browserMock(downloadFail: true),
        tmp: tmpDir,
        downloads: FakeDownloads(),
      ),
    );
    await tester.pumpAndSettle();
    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.runAsync(() async {
      await tester.tap(spoken('Download zip'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(spokenContaining('Zip failed'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5)); // drain the snackbar timer
  });
}
