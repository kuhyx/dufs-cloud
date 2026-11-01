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

  testWidgets('long-press enters multi-select; tap toggles; close exits', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byTooltip('Move'), findsOneWidget);

    // A tile's checkbox toggles it, as does tapping the tile body.
    await tester.tap(find.byType(Checkbox).first);
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);
    await tester.tap(find.byType(Checkbox).first);
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);

    // Tapping another tile adds it; tapping it again removes it.
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);

    // Close returns to the normal browse bar (the search field reappears).
    await tester.tap(find.byTooltip('Cancel selection'));
    await tester.pumpAndSettle();
    expect(find.text('1 selected'), findsNothing);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('range select: arms, selects the anchor..target range, disarms', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    // Sorted (dirs first, then name asc): Sub, clip.mp4, data.bin, doc.txt,
    // pic.jpg.

    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);

    await tester.tap(find.byTooltip('Select range'));
    await tester.pump();
    expect(find.byTooltip('Range select armed — tap an item'), findsOneWidget);

    await tester.tap(find.text('pic.jpg'));
    await tester.pump();
    // clip.mp4..pic.jpg inclusive = clip.mp4, data.bin, doc.txt, pic.jpg.
    expect(find.text('4 selected'), findsOneWidget);
    // Armed state cleared after the range tap.
    expect(find.byTooltip('Select range'), findsOneWidget);

    // The anchor moved to pic.jpg; a plain tap elsewhere just toggles it.
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('3 selected'), findsOneWidget);
  });

  testWidgets('range select falls back to a plain toggle when the anchor '
      'vanished from the listing', (tester) async {
    final settings = await testSettings(configured: true);
    // Pull-to-refresh stays available in select mode and does not clear the
    // selection, so the anchor can disappear server-side under us.
    await tester.pumpWidget(browserApp(settings, vanishingMock()));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();
    await tester.tap(find.byTooltip('Select range'));
    await tester.pump();

    await tester.fling(find.text('doc.txt'), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();
    expect(find.text('clip.mp4'), findsNothing);
    // Still armed, and clip.mp4 is still counted even though it is gone.
    expect(find.byTooltip('Range select armed — tap an item'), findsOneWidget);
    expect(find.text('1 selected'), findsOneWidget);

    // No resolvable anchor: the tap degrades to a plain toggle and disarms.
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);
    expect(find.byTooltip('Select range'), findsOneWidget);

    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);
  });
}
