import 'dart:io';

import 'package:dufs_client/screens/pdf_screen.dart';
import 'package:flutter_test/flutter_test.dart';

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
}
