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

  // Drives a long-press drag from [from] to [to], asserting the drag
  // feedback appears mid-gesture, and returns after the drop settles.
  Future<void> dragOnto(
    WidgetTester tester,
    Finder from,
    Finder to, {
    required String expectFeedback,
  }) async {
    final gesture = await tester.startGesture(tester.getCenter(from));
    await tester.pump(const Duration(milliseconds: 700));
    await gesture.moveTo(tester.getCenter(to));
    await tester.pump();
    expect(
      tester.widget<Text>(find.byKey(const Key('drag-count'))).data,
      expectFeedback,
    );
    await gesture.up();
    await tester.pumpAndSettle();
  }

  testWidgets('drag in select mode moves the selection into a folder', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final methods = <String>[];
    String? destination;
    final mock = MockClient((req) async {
      methods.add(req.method);
      if (req.method == 'MOVE') {
        destination = req.headers['destination'];
        return http.Response('', 201);
      }
      if (req.url.path == '/Sub') return http.Response(listingXml([]), 207);
      return http.Response(listingXml(rootListing), 207);
    });
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pumpAndSettle();

    // Long-press enters select mode; the next long-press starts a drag.
    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();
    expect(find.widgetWithText(AppBar, '1'), findsOneWidget);

    await dragOnto(
      tester,
      find.text('clip.mp4'),
      find.text('Sub'),
      expectFeedback: '1',
    );
    expect(methods.where((m) => m == 'MOVE').length, 1);
    // WebDAV's Destination is the full target URL: folder + kept name.
    expect(destination, endsWith('/Sub/clip.mp4'));
    // The move exits select mode and reloads the folder.
    expect(find.widgetWithText(AppBar, '1'), findsNothing);
  });

  testWidgets('dragging two selected items moves both', (tester) async {
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
    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.widgetWithText(AppBar, '2'), findsOneWidget);

    await dragOnto(
      tester,
      find.text('clip.mp4'),
      find.text('Sub'),
      expectFeedback: '2',
    );
    expect(methods.where((m) => m == 'MOVE').length, 2);
  });

  testWidgets('dragging an unselected item carries only that item', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final destinations = <String>[];
    final mock = MockClient((req) async {
      if (req.method == 'MOVE') {
        destinations.add(req.url.path);
        return http.Response('', 201);
      }
      if (req.url.path == '/Sub') return http.Response(listingXml([]), 207);
      return http.Response(listingXml(rootListing), 207);
    });
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();

    // data.bin is not selected, so only it travels.
    await dragOnto(
      tester,
      find.text('data.bin'),
      find.text('Sub'),
      expectFeedback: '1',
    );
    expect(destinations, ['/data.bin']);
  });

  testWidgets('a folder refuses a drop of itself', (tester) async {
    final settings = await testSettings(configured: true);
    final methods = <String>[];
    final mock = MockClient((req) async {
      methods.add(req.method);
      if (req.url.path == '/Sub') return http.Response(listingXml([]), 207);
      return http.Response(listingXml(rootListing), 207);
    });
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('Sub'));
    await tester.pump();

    await dragOnto(
      tester,
      find.text('Sub'),
      find.text('Sub'),
      expectFeedback: '1',
    );
    // Dropping a folder on itself would orphan its subtree: no MOVE at all,
    // and the selection is left untouched.
    expect(methods.where((m) => m == 'MOVE'), isEmpty);
    expect(find.widgetWithText(AppBar, '1'), findsOneWidget);
  });

  testWidgets('a failed drag-move is reported in a snackbar', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock(moveFail: true)));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();

    await dragOnto(
      tester,
      find.text('clip.mp4'),
      find.text('Sub'),
      expectFeedback: '1',
    );
    expect(spoken('1 item(s) could not be moved'), findsOneWidget);
  });
}
