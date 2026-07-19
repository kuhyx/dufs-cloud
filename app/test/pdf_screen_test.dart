import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dufs_client/screens/pdf_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/fake_webview_platform.dart';

DufsClient _client(MockClient mock) => DufsClient(
      baseUrl: 'https://host',
      username: 'u',
      password: 'p',
      httpClient: mock,
    );

PdfScreen _screen({
  required Future<Directory> Function() tempDir,
  DufsClient? client,
}) =>
    PdfScreen(
      client: client ??
          _client(MockClient((_) async => http.Response.bytes([1, 2, 3], 200))),
      path: '/doc.pdf',
      title: 'doc.pdf',
      tempDir: tempDir,
    );

/// `_init()` does real disk I/O (extracting the vendored pdf.js tree,
/// downloading, binding a real HttpServer) — the default widget-test zone
/// fakes time and never services that, so it must run inside
/// [WidgetTester.runAsync]. `pumpAndSettle` also can't be used regardless:
/// the CircularProgressIndicator shown while that's in flight animates
/// forever and never lets frames go quiet (the same reason
/// video_screen_test.dart pumps explicitly instead).
Future<void> _pumpUntilSettled(WidgetTester tester) async {
  for (var i = 0; i < 3000; i++) {
    if (find.byType(CircularProgressIndicator).evaluate().isEmpty) return;
    await Future<void>.delayed(const Duration(milliseconds: 10));
    await tester.pump();
  }
}

void main() {
  group('pdfViewerContentType', () {
    test('maps known extensions, defaulting unknown ones to opaque binary', () {
      expect(pdfViewerContentType('a.html'), 'text/html');
      expect(pdfViewerContentType('a.mjs'), 'text/javascript');
      expect(pdfViewerContentType('a.js'), 'text/javascript');
      expect(pdfViewerContentType('a.css'), 'text/css');
      expect(pdfViewerContentType('a.json'), 'application/json');
      expect(pdfViewerContentType('a.svg'), 'image/svg+xml');
      expect(pdfViewerContentType('a.wasm'), 'application/wasm');
      expect(pdfViewerContentType('a.pdf'), 'application/pdf');
      expect(pdfViewerContentType('a.pfb'), 'application/octet-stream');
      expect(pdfViewerContentType('no-extension'), 'application/octet-stream');
    });
  });

  group('resolvePdfViewerAsset', () {
    late Directory root;

    setUp(() async {
      root = await Directory.systemTemp.createTemp('resolve_asset_test_');
      await File('${root.path}/web/viewer.html').create(recursive: true);
    });

    tearDown(() async {
      if (root.existsSync()) await root.delete(recursive: true);
    });

    test('resolves an existing file to its path and content type', () {
      final asset = resolvePdfViewerAsset('/web/viewer.html', root);
      expect(asset, isNotNull);
      expect(asset!.file.path, '${root.path}/web/viewer.html');
      expect(asset.contentType, 'text/html');
    });

    test('returns null for a path that does not exist', () {
      expect(resolvePdfViewerAsset('/web/missing.html', root), isNull);
    });
  });

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

  testWidgets('extracts the viewer, downloads the file and loads it', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(home: _screen(tempDir: () async => tempRoot)),
      );
      await _pumpUntilSettled(tester);
    });

    expect(find.byType(WebViewWidget), findsOneWidget);
    expect(fake.lastLoadedUrl, isNotNull);
    expect(fake.lastLoadedUrl!.path, endsWith('/web/viewer.html'));
    expect(fake.lastLoadedUrl!.query, 'file=target.pdf');
    expect(
      File('${tempRoot.path}/pdfjs/web/viewer.html').existsSync(),
      isTrue,
    );
    expect(
      File('${tempRoot.path}/pdfjs/web/target.pdf').readAsBytesSync(),
      [1, 2, 3],
    );
  });

  testWidgets('reuses an already-extracted viewer on a later open', (
    tester,
  ) async {
    late DateTime extractedAt;
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(home: _screen(tempDir: () async => tempRoot)),
      );
      await _pumpUntilSettled(tester);
      final marker = File('${tempRoot.path}/pdfjs/.extracted');
      expect(marker.existsSync(), isTrue);
      extractedAt = marker.statSync().modified;

      // Re-opening (e.g. a second PDF) must not re-extract.
      await tester.pumpWidget(
        MaterialApp(home: _screen(tempDir: () async => tempRoot)),
      );
      await _pumpUntilSettled(tester);
      expect(marker.statSync().modified, extractedAt);
    });
  });

  testWidgets('shows an error message when the download fails', (
    tester,
  ) async {
    final failing = _client(MockClient((_) async => http.Response('', 500)));
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(
          home: _screen(client: failing, tempDir: () async => tempRoot),
        ),
      );
      await _pumpUntilSettled(tester);
    });
    expect(find.textContaining('Could not open'), findsOneWidget);
    expect(find.byType(WebViewWidget), findsNothing);
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
        MaterialApp(home: _screen(tempDir: () async => tempRoot)),
      );
      await _pumpUntilSettled(tester);
      final port = fake.lastLoadedUrl!.port;

      final html = await _rawGet(port, '/web/viewer.html');
      expect(html.status, 200);
      expect(html.contentType, contains('text/html'));

      final mjs = await _rawGet(port, '/web/viewer.mjs');
      expect(mjs.contentType, contains('text/javascript'));

      final wasm = await _rawGet(port, '/web/wasm/openjpeg.wasm');
      expect(wasm.contentType, contains('application/wasm'));

      final pdf = await _rawGet(port, '/web/target.pdf');
      expect(pdf.contentType, contains('application/pdf'));

      final missing = await _rawGet(port, '/web/does-not-exist.txt');
      expect(missing.status, 404);
    });
  });

  testWidgets('closes the local server on dispose', (tester) async {
    late int port;
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(home: _screen(tempDir: () async => tempRoot)),
      );
      await _pumpUntilSettled(tester);
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

  testWidgets(
    'closes the just-bound server if unmounted before it is stored',
    (tester) async {
      final gate = Completer<void>();
      final gatedClient = _client(
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
            home: _screen(client: gatedClient, tempDir: () async => tempRoot),
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
    },
  );
}

/// A bare HTTP/1.1 GET over a raw [Socket], reading only up through the
/// header terminator (no need to wait for the body or a connection close).
Future<({int status, String contentType})> _rawGet(
  int port,
  String path,
) async {
  final socket = await Socket.connect(InternetAddress.loopbackIPv4, port);
  socket.write('GET $path HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
  final head = await socket
      .transform<String>(const _Latin1Decoder())
      .transform(const LineSplitter())
      .takeWhile((line) => line.isNotEmpty)
      .toList();
  socket.destroy();
  final status = int.parse(head.first.split(' ')[1]);
  final contentTypeLine = head.firstWhere(
    (l) => l.toLowerCase().startsWith('content-type:'),
    orElse: () => 'content-type: ',
  );
  return (status: status, contentType: contentTypeLine.split(': ')[1]);
}

/// [LineSplitter] needs a decoded [Stream<String>]; the response headers
/// are always ASCII, so a plain latin1 stream transformer suffices without
/// pulling in a UTF-8 decoder that could throw on binary body bytes we
/// never even read.
class _Latin1Decoder extends StreamTransformerBase<Uint8List, String> {
  const _Latin1Decoder();

  @override
  Stream<String> bind(Stream<Uint8List> stream) => stream.map(latin1.decode);
}
