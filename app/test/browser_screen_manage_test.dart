import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/browser_harness.dart';
import 'support/browser_mocks.dart';
import 'support/fake_webview_platform.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // BrowserScreen pushes a real VideoScreen, which builds a MediaKitPlayer
  // (libmpv) rather than a fake — so the native library has to be loaded here
  // exactly as main.dart does it.
  MediaKit.ensureInitialized();

  setUp(() {
    WebViewPlatform.instance = FakeWebViewPlatform();
  });

  testWidgets('delete confirmed reloads; cancel does nothing', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();

    // Cancel path.
    await tester.tap(find.byType(PopupMenuButton<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);

    // Confirm path.
    await tester.tap(find.byType(PopupMenuButton<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('delete error shows a snackbar', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(
      browserApp(settings, browserMock(deleteFail: true)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(PopupMenuButton<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Delete failed'), findsOneWidget);
  });

  testWidgets(
    'rename: pre-filled, cancel, unchanged, and a successful rename',
    (tester) async {
      final methods = <String>[];
      String? destination;
      final settings = await testSettings(configured: true);
      await tester.pumpWidget(
        browserApp(
          settings,
          MockClient((req) async {
            methods.add(req.method);
            if (req.method == 'MOVE') {
              destination = req.headers['destination'];
              return http.Response('', 201);
            }
            return http.Response(listingXml(rootListing), 207);
          }),
        ),
      );
      await tester.pumpAndSettle();
      // The last tile is a file (folders sort first): pic.jpg.

      // Cancel: pre-filled with the current name, no MOVE.
      await tester.tap(find.byType(PopupMenuButton<String>).last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rename'));
      await tester.pumpAndSettle();
      final field = tester.widget<TextField>(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        ),
      );
      expect(field.controller?.text, 'pic.jpg');
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(methods, isNot(contains('MOVE')));

      // Confirming with the name unchanged is a no-op too.
      await tester.tap(find.byType(PopupMenuButton<String>).last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rename'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Rename'));
      await tester.pumpAndSettle();
      expect(methods, isNot(contains('MOVE')));

      // A real rename → MOVE with the new destination.
      await tester.tap(find.byType(PopupMenuButton<String>).last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rename'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        ),
        'renamed.jpg',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Rename'));
      await tester.pumpAndSettle();
      expect(methods, contains('MOVE'));
      expect(destination, endsWith('/renamed.jpg'));
    },
  );

  testWidgets('rename surfaces a snackbar on failure', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock(moveFail: true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(PopupMenuButton<String>).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rename'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(TextField),
      ),
      'renamed.jpg',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Rename'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Rename failed'), findsOneWidget);
  });

  testWidgets('new folder: create, cancel and error', (tester) async {
    // Cancel (and empty-name) path: no MKCOL.
    final methods = <String>[];
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(
      browserApp(
        settings,
        MockClient((req) async {
          methods.add(req.method);
          if (req.method == 'MKCOL') return http.Response('', 201);
          return http.Response(listingXml(rootListing), 207);
        }),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.create_new_folder));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(methods, isNot(contains('MKCOL')));

    // Create with a blank name is a no-op too.
    await tester.tap(find.byIcon(Icons.create_new_folder));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();
    expect(methods, isNot(contains('MKCOL')));

    // Create with a name → MKCOL.
    await tester.tap(find.byIcon(Icons.create_new_folder));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(TextField),
      ),
      'Trips',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();
    expect(methods, contains('MKCOL'));
  });

  testWidgets('new folder surfaces an error', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock(mkcolFail: true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.create_new_folder));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(TextField),
      ),
      'X',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Create failed'), findsOneWidget);
  });
}
