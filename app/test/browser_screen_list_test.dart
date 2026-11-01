import 'package:dufs_client/screens/settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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

  testWidgets('unconfigured shows a hint and no upload button', (tester) async {
    final settings = await testSettings(configured: false);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    expect(find.textContaining('Tap the gear'), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsNothing);
  });

  testWidgets('lists entries with icons and sizes', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    expect(find.text('Sub'), findsOneWidget);
    expect(find.text('pic.jpg'), findsOneWidget);
    expect(find.text('clip.mp4'), findsOneWidget);
    expect(find.text('doc.txt'), findsOneWidget);
    expect(find.text('30 B'), findsOneWidget);
    expect(find.byIcon(Icons.folder), findsOneWidget);
    expect(find.byIcon(Icons.insert_drive_file), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsOneWidget);
  });

  testWidgets('opening a folder, then going up', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sub'));
    await tester.pumpAndSettle();
    expect(find.text('This folder is empty.'), findsOneWidget);
    expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
    await tester.tap(find.byIcon(Icons.arrow_upward));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('a listing error is surfaced', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock(listFail: true)));
    await tester.pumpAndSettle();
    expect(find.textContaining('Exception'), findsOneWidget);
  });

  testWidgets('opening settings and saving re-bootstraps', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    expect(find.byType(SettingsScreen), findsOneWidget);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    // Back on the browser after re-bootstrap.
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('closing settings without saving keeps the listing', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('pull to refresh reloads the listing', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    await tester.fling(find.text('pic.jpg'), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });
}
