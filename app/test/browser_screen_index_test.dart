import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/browser_harness.dart';
import 'support/fake_webview_platform.dart';

/// Answers PROPFIND after [delay]; `/Sub` is empty, everything else is the
/// root listing, so a walk lists `/` then `/Sub`.
MockClient _slow(Duration delay) => MockClient((req) async {
  if (req.method != 'PROPFIND') return http.Response.bytes([1], 200);
  await Future<void>.delayed(delay);
  final items = req.url.path == '/Sub'
      ? const <(String, bool, int)>[]
      : rootListing;
  return http.Response(listingXml(items), 207);
});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  setUp(() {
    WebViewPlatform.instance = FakeWebViewPlatform();
  });

  testWidgets(
    'indexing shows true folder and entry counts and can be cancelled',
    (tester) async {
      final settings = await testSettings(configured: true);
      await tester.pumpWidget(
        browserApp(settings, _slow(const Duration(milliseconds: 200))),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'pic');
      // The root listing (1 folder, 5 entries) lands; /Sub is still pending.
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.text('Indexing the cloud…'), findsOneWidget);
      expect(find.byKey(const Key('index-folders')), findsOneWidget);
      expect(
        tester.widget<Text>(find.byKey(const Key('index-folders'))).data,
        '1',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('index-entries'))).data,
        '5',
      );

      // Cancel keeps what was found and ends the spinner.
      await tester.tap(find.bySemanticsLabel('Cancel indexing'));
      await tester.pumpAndSettle();
      expect(find.text('Indexing the cloud…'), findsNothing);
      expect(find.text('pic.jpg'), findsOneWidget);
      expect(find.bySemanticsLabel('Partial index'), findsOneWidget);
    },
  );

  testWidgets('a finished index is not flagged partial', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, _slow(Duration.zero)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'pic');
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
    expect(find.bySemanticsLabel('Partial index'), findsNothing);
  });

  testWidgets('long-press multi-select gives a selection haptic', (
    tester,
  ) async {
    final calls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'HapticFeedback.vibrate') {
          calls.add('${call.arguments}');
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, _slow(Duration.zero)));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);
    // The framework's own long-press feedback (vibrate, no type) may also fire;
    // ours is the selection click, exactly once.
    expect(
      calls.where((c) => c == 'HapticFeedbackType.selectionClick'),
      hasLength(1),
    );
  });
}
