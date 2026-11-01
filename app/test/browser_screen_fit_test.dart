import 'package:dufs_client/widgets/entry_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/browser_harness.dart';
import 'support/fake_webview_platform.dart';

/// Pixel 6a: 1080x2400 at 2.625, with its status bar and gesture-nav insets.
void _pixel6a(WidgetTester tester) {
  tester.view
    ..physicalSize = const Size(1080, 2400)
    ..devicePixelRatio = 2.625
    ..padding = const FakeViewPadding(top: 132, bottom: 63)
    ..viewPadding = const FakeViewPadding(top: 132, bottom: 63);
  addTearDown(() {
    tester.view
      ..resetPhysicalSize()
      ..resetDevicePixelRatio()
      ..resetPadding()
      ..resetViewPadding();
  });
}

MockClient _folder(int files) => MockClient((req) async {
  if (req.method != 'PROPFIND') return http.Response.bytes([1], 200);
  final items = [for (var i = 0; i < files; i++) ('/f$i.txt', false, 10 + i)];
  return http.Response(listingXml(items), 207);
});

/// Every vertical Scrollable on screen must have nothing to scroll.
void _expectNoVerticalScroll(WidgetTester tester) {
  for (final element in find.byType(Scrollable).evaluate()) {
    final state = (element as StatefulElement).state as ScrollableState;
    if (state.position.axis != Axis.vertical) continue;
    expect(
      state.position.maxScrollExtent,
      0,
      reason: 'a vertical Scrollable still scrolls',
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  setUp(() {
    WebViewPlatform.instance = FakeWebViewPlatform();
  });

  for (final count in [5, 24, 200]) {
    testWidgets('a folder of $count files fits one screen', (tester) async {
      _pixel6a(tester);
      final settings = await testSettings(configured: true);
      await tester.pumpWidget(browserApp(settings, _folder(count)));
      await tester.pumpAndSettle();

      _expectNoVerticalScroll(tester);
      // The first tile is on screen and can be hit (tapped).
      expect(find.text('f0.txt').hitTestable(), findsOneWidget);
      expect(find.byType(EntryTile), findsWidgets);
    });
  }

  testWidgets('overflow moves to further pages by horizontal swipe', (
    tester,
  ) async {
    _pixel6a(tester);
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, _folder(200)));
    await tester.pumpAndSettle();

    // The listing is name-sorted, so 'f99.txt' is the last of 200 entries.
    expect(find.text('f99.txt'), findsNothing);
    // 200 files cannot fit one page, so there are pages to swipe through.
    expect(
      find.byKey(const ValueKey<String>('fit-grid-dot-1')),
      findsOneWidget,
    );
    for (var i = 0; i < 30; i++) {
      await tester.fling(find.byType(PageView), const Offset(-600, 0), 2000);
      await tester.pumpAndSettle();
    }
    expect(find.text('f99.txt').hitTestable(), findsOneWidget);
    _expectNoVerticalScroll(tester);
  });
}
