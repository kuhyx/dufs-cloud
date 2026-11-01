import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/fake_webview_platform.dart';
import 'support/pdf_harness.dart';

void main() {
  late FakeWebViewPlatform fake;
  late Directory tempRoot;

  setUp(() async {
    fake = FakeWebViewPlatform();
    WebViewPlatform.instance = fake;
    tempRoot = await Directory.systemTemp.createTemp('pdf_screen_test_');
  });

  tearDown(() async {
    if (tempRoot.existsSync()) await tempRoot.delete(recursive: true);
  });

  testWidgets('serves the extracted files with matching content types', (
    tester,
  ) async {
    // flutter_test's TestWidgetsFlutterBinding forces every dart:io
    // HttpClient (and anything built on it, like package:http) to return
    // 400 by default; issue plain sockets to the loopback server instead,
    // which aren't intercepted. The whole flow — including the live
    // request — stays inside one runAsync call so the real-time zone
    // backing the server's request loop never gets torn down mid-test.
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(home: pdfScreen(tempDir: () async => tempRoot)),
      );
      await pumpUntilSettled(tester);
      final port = fake.lastLoadedUrl!.port;

      final html = await rawGet(port, '/web/viewer.html');
      expect(html.status, 200);
      expect(html.contentType, contains('text/html'));

      final mjs = await rawGet(port, '/web/viewer.mjs');
      expect(mjs.contentType, contains('text/javascript'));

      final wasm = await rawGet(port, '/web/wasm/openjpeg.wasm');
      expect(wasm.contentType, contains('application/wasm'));

      final pdf = await rawGet(port, '/web/target.pdf');
      expect(pdf.contentType, contains('application/pdf'));

      final missing = await rawGet(port, '/web/does-not-exist.txt');
      expect(missing.status, 404);
    });
  });

  testWidgets('closes the local server on dispose', (tester) async {
    late int port;
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(home: pdfScreen(tempDir: () async => tempRoot)),
      );
      await pumpUntilSettled(tester);
      port = fake.lastLoadedUrl!.port;

      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      await tester.pump();
      // dispose() closes the server without awaiting it; give the real
      // socket close a moment to actually complete.
      await Future<void>.delayed(const Duration(milliseconds: 200));

      // The server's port no longer accepts connections once disposed.
      await expectLater(
        Socket.connect(InternetAddress.loopbackIPv4, port),
        throwsA(isA<SocketException>()),
      );
    });
  });

  testWidgets('closes the just-bound server if unmounted before it is stored', (
    tester,
  ) async {
    final gate = Completer<void>();
    final gatedClient = pdfClient(
      MockClient((_) async {
        await gate.future;
        return http.Response.bytes([1, 2, 3], 200);
      }),
    );
    // Seeding must be synchronous: real I/O futures never complete in the
    // fake-async test zone, so an awaited create() here hangs the test.
    final pdfFile = File('${tempRoot.path}/pdfjs/web/target.pdf');
    Directory('${tempRoot.path}/pdfjs/web').createSync(recursive: true);
    // With the marker present _init() skips unpacking the viewer, which
    // otherwise blocks in AssetManifest.loadFromAssetBundle (that only
    // resolves while the binding is pumped) and never reaches the bind.
    File('${tempRoot.path}/pdfjs/.extracted').createSync();
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(
          home: pdfScreen(client: gatedClient, tempDir: () async => tempRoot),
        ),
      );
      // _init() is now blocked awaiting the download; unmount before it
      // resumes, so the "unmounted before the server is stored" branch
      // (rather than the ordinary dispose() path) is what closes it.
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      gate.complete();
    });
    // The gated continuation only runs once control leaves the first
    // runAsync, so wait for it in a second one. Writing the pdf is the step
    // immediately before the bind, so the file appearing proves _init()
    // really did run on to bind a server while unmounted.
    await tester.runAsync(() async {
      for (var i = 0; i < 500 && !pdfFile.existsSync(); i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    expect(pdfFile.existsSync(), isTrue);
    expect(find.byType(WebViewWidget), findsNothing);
  });
}
