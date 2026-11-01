import 'dart:convert';

import 'package:dufs_client/screens/audio_screen.dart';
import 'package:dufs_client/screens/image_screen.dart';
import 'package:dufs_client/screens/pdf_screen.dart';
import 'package:dufs_client/screens/video_screen.dart';
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

  testWidgets('opening an image pushes the image screen', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('pic.jpg'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(ImageScreen), findsOneWidget);
  });

  testWidgets('opening a video pushes the video screen', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('clip.mp4'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(VideoScreen), findsOneWidget);
  });

  testWidgets('opening a video plays the original even when a proxy exists', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final mock = MockClient((req) async {
      if (req.method == 'PROPFIND') {
        return http.Response(listingXml(rootListing), 207);
      }
      if (req.url.path == '/.meta/index.json') {
        return http.Response(
          jsonEncode({
            'entries': {
              '/clip.mp4': {'proxyPath': '/.proxies/clip.mp4.mp4'},
            },
          }),
          200,
        );
      }
      return http.Response.bytes([1, 2, 3], 200);
    });
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pumpAndSettle();
    await tester.tap(find.text('clip.mp4'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    // The proxy is built with `-map 0:v:0 -map 0:a:0?`, so it has no
    // subtitle tracks; libmpv can play the original container directly.
    final videoScreen = tester.widget<VideoScreen>(find.byType(VideoScreen));
    expect(videoScreen.path, '/clip.mp4');
  });

  testWidgets('opening a video prefers the app proxy when the index has one', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    final mock = MockClient((req) async {
      if (req.method == 'PROPFIND') {
        return http.Response(listingXml(rootListing), 207);
      }
      if (req.url.path == '/.meta/index.json') {
        return http.Response(
          jsonEncode({
            'entries': {
              '/clip.mp4': {
                'proxyPath': '/.proxies/clip.mp4.mp4',
                'appProxyPath': '/.proxies/clip.mp4.app.mkv',
              },
            },
          }),
          200,
        );
      }
      return http.Response.bytes([1, 2, 3], 200);
    });
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pumpAndSettle();
    await tester.tap(find.text('clip.mp4'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    // The app proxy exists only when libmpv cannot decode the original's
    // audio (TrueHD/MLP); it is Matroska and keeps the subtitle tracks, so
    // it wins over both the original and the browser `.mp4` proxy.
    final videoScreen = tester.widget<VideoScreen>(find.byType(VideoScreen));
    expect(videoScreen.path, '/.proxies/clip.mp4.app.mkv');
  });

  testWidgets('opening audio pushes the audio screen', (tester) async {
    final settings = await testSettings(configured: true);
    final mock = MockClient((req) async {
      if (req.method == 'PROPFIND') {
        return http.Response(listingXml([('/song.mp3', false, 10)]), 207);
      }
      return http.Response.bytes([1, 2, 3], 200);
    });
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pumpAndSettle();
    await tester.tap(find.text('song.mp3'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(AudioScreen), findsOneWidget);
  });

  testWidgets('opening a PDF pushes the PDF screen', (tester) async {
    final settings = await testSettings(configured: true);
    final mock = MockClient((req) async {
      if (req.method == 'PROPFIND') {
        return http.Response(listingXml([('/doc.pdf', false, 10)]), 207);
      }
      return http.Response.bytes([1, 2, 3], 200);
    });
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pumpAndSettle();
    await tester.tap(find.text('doc.pdf'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(PdfScreen), findsOneWidget);
  });
}
