import 'dart:async';
import 'dart:io';

import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show AssetManifest, rootBundle;
import 'package:path_provider/path_provider.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Directory (relative to the app's temp dir) the vendored pdf.js viewer and
/// the currently-viewed PDF are extracted into.
const String _pdfjsDir = 'pdfjs';

/// Content-Type for a static file, by extension. pdf.js's viewer is loaded
/// as ES modules (`<script type="module">`), which browsers refuse to
/// execute unless served with a JavaScript MIME type — this only matters
/// because everything is served locally rather than as opaque bytes.
///
/// Public (not `_`-prefixed) so it's directly unit-testable without needing
/// a real HTTP round-trip, unlike the rest of [PdfScreen]'s serving logic.
String pdfViewerContentType(String path) {
  final ext =
      path.contains('.') ? path.substring(path.lastIndexOf('.') + 1) : '';
  switch (ext) {
    case 'html':
      return 'text/html';
    case 'mjs':
    case 'js':
      return 'text/javascript';
    case 'css':
      return 'text/css';
    case 'json':
      return 'application/json';
    case 'svg':
      return 'image/svg+xml';
    case 'wasm':
      return 'application/wasm';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

/// Resolves a request path against [root] to a static-file response: the
/// file to stream and its content type, or `null` if it doesn't exist. Pure
/// (no HttpRequest/HttpResponse I/O) so the routing logic is directly
/// unit-testable; `_serve` is just the thin glue applying this to sockets.
({File file, String contentType})? resolvePdfViewerAsset(
  String requestPath,
  Directory root,
) {
  final file = File('${root.path}$requestPath');
  if (!file.existsSync()) return null;
  return (file: file, contentType: pdfViewerContentType(file.path));
}

/// Full-screen PDF viewer: downloads the file over authenticated HTTP, then
/// renders it via a vendored copy of pdf.js in a WebView. pdf.js's viewer
/// loads itself as ES modules, which browsers block from a `file://` origin
/// (CORS treats it as origin "null") — so the extracted viewer is served
/// over a tiny loopback-only HTTP server instead, giving it a real origin.
class PdfScreen extends StatefulWidget {
  /// Creates a viewer for [path] using [client].
  const PdfScreen({
    required this.client,
    required this.path,
    required this.title,
    this.tempDir,
    super.key,
  });

  /// The dufs client (supplies the URL, auth headers and download).
  final DufsClient client;

  /// Absolute cloud path of the PDF.
  final String path;

  /// Title shown in the app bar.
  final String title;

  /// Overrides the writable directory the viewer + PDF are extracted into
  /// (tests inject a temp dir instead of the real platform one).
  final Future<Directory> Function()? tempDir;

  @override
  State<PdfScreen> createState() => _PdfScreenState();
}

class _PdfScreenState extends State<PdfScreen> {
  WebViewController? _controller;
  HttpServer? _server;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_init());
  }

  Future<void> _init() async {
    try {
      final base = await (widget.tempDir ?? getTemporaryDirectory)();
      final root = Directory('${base.path}/$_pdfjsDir');
      await _extractViewerOnce(root);
      final bytes = await widget.client.download(widget.path);
      final pdfFile = File('${root.path}/web/target.pdf');
      await pdfFile.writeAsBytes(bytes, flush: true);

      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      unawaited(_serve(server, root));
      if (!mounted) {
        unawaited(server.close(force: true));
        return;
      }
      _server = server;

      final controller = WebViewController();
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.loadRequest(
        Uri.parse(
          'http://127.0.0.1:${server.port}/web/viewer.html?file=target.pdf',
        ),
      );
      if (!mounted) return;
      setState(() => _controller = controller);
    } on Exception catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  /// Serves [root]'s contents at their matching path forever (until the
  /// server is closed in [dispose]) — a plain static file server.
  Future<void> _serve(HttpServer server, Directory root) async {
    await for (final request in server) {
      final relative = Uri.decodeComponent(request.uri.path);
      final asset = resolvePdfViewerAsset(relative, root);
      if (asset != null) {
        request.response.headers.contentType = ContentType.parse(
          asset.contentType,
        );
        await request.response.addStream(asset.file.openRead());
      } else {
        request.response.statusCode = HttpStatus.notFound;
      }
      await request.response.close();
    }
  }

  /// Copies the bundled pdf.js viewer out of the (read-only) asset bundle
  /// into [root] once; skipped on later opens once the marker file exists.
  Future<void> _extractViewerOnce(Directory root) async {
    final marker = File('${root.path}/.extracted');
    if (marker.existsSync()) return;
    final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
    for (final asset in manifest.listAssets()) {
      if (!asset.startsWith('assets/pdfjs/')) continue;
      final data = await rootBundle.load(asset);
      final relative = asset.substring('assets/pdfjs/'.length);
      final file = File('${root.path}/$relative');
      await file.parent.create(recursive: true);
      await file.writeAsBytes(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
        flush: true,
      );
    }
    await marker.create(recursive: true);
  }

  @override
  void dispose() {
    unawaited(_server?.close(force: true));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: _error != null
          ? Center(child: Text('Could not open: $_error'))
          : controller == null
              ? const Center(child: CircularProgressIndicator())
              : WebViewWidget(controller: controller),
    );
  }
}
