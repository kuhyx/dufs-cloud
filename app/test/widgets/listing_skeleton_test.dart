import 'dart:async';

import 'package:dufs_client/widgets/listing_skeleton.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../support/browser_harness.dart';
import '../support/fake_webview_platform.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();

  setUp(() {
    WebViewPlatform.instance = FakeWebViewPlatform();
  });

  testWidgets('a pending listing shows skeleton tiles, no spinner', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final pending = Completer<http.Response>();
    final mock = MockClient((_) => pending.future);
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pump();
    expect(find.byType(ListingSkeleton), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('the skeleton is static: no running animations', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: ListingSkeleton())),
    );
    expect(tester.hasRunningAnimations, isFalse);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
}
