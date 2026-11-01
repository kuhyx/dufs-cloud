import 'dart:convert';
import 'dart:io';

import 'package:dufs_client/models/upload_source.dart';
import 'package:dufs_client/services/public_downloads.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'browser_harness.dart';

/// Fake network and platform pieces shared by the browser-screen tests.
MockClient browserMock({
  bool listFail = false,
  bool downloadFail = false,
  bool uploadFail = false,
  bool deleteFail = false,
  bool mkcolFail = false,
  bool moveFail = false,
}) {
  return MockClient((req) async {
    switch (req.method) {
      case 'MKCOL':
        return mkcolFail ? http.Response('', 409) : http.Response('', 201);
      case 'MOVE':
        return moveFail ? http.Response('', 409) : http.Response('', 201);
      case 'PROPFIND':
        if (listFail) return http.Response('', 500);
        if (req.url.path == '/Sub') return http.Response(listingXml([]), 207);
        return http.Response(listingXml(rootListing), 207);
      case 'GET':
        return downloadFail
            ? http.Response('', 500)
            : http.Response.bytes([1, 2, 3], 200);
      case 'PUT':
        return uploadFail ? http.Response('', 500) : http.Response('', 201);
      case 'DELETE':
        return deleteFail ? http.Response('', 500) : http.Response('', 204);
      default:
        return http.Response('', 400);
    }
  });
}

// Serves the full root listing once, then a listing with clip.mp4 removed —
// i.e. the file disappears server-side between the initial load and a
// pull-to-refresh. fetchMeta uses GET, so the first PROPFIND is the load.
MockClient vanishingMock() {
  var listings = 0;
  return MockClient((req) async {
    if (req.method != 'PROPFIND') return http.Response('', 400);
    final gone = listings++ > 0;
    final items = gone
        ? rootListing.where((e) => e.$1 != '/clip.mp4').toList()
        : rootListing;
    return http.Response(listingXml(items), 207);
  });
}

// Stands in for the MediaStore channel: records what was staged, answers
// with a renamed file (as MediaStore does on collision), and reports whether
// a viewer took the Open.
class FakeDownloads extends PublicDownloads {
  FakeDownloads({this.openOk = true, this.failSave = false});

  final bool openOk;
  final bool failSave;
  final List<String> staged = <String>[];
  final List<SavedFile> opened = <SavedFile>[];

  @override
  Future<SavedFile> save(String tempPath, String name) async {
    if (failSave) throw Exception('MediaStore insert returned null');
    staged.add(tempPath);
    return SavedFile(
      uri: 'content://media/downloads/1',
      name: '$name (1)',
      relativePath: 'Download/',
      mime: 'application/octet-stream',
    );
  }

  @override
  Future<bool> open(SavedFile file) async {
    opened.add(file);
    return openOk;
  }
}

UploadSource uploadSource(String name, List<int> bytes) => UploadSource(
  name: name,
  size: bytes.length,
  open: () => Stream.value(bytes),
);

// A GET whose body dribbles out slowly, so a test can cancel mid-stream.
http.StreamedResponse slowBody(int status) {
  Stream<List<int>> body() async* {
    for (var i = 0; i < 60; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
      yield [i];
    }
  }

  return http.StreamedResponse(body(), status);
}

MockClient slowGetMock() {
  return MockClient.streaming((req, body) async {
    if (req.method == 'PROPFIND') {
      return http.StreamedResponse(
        Stream.value(utf8.encode(listingXml(rootListing))),
        207,
      );
    }
    if (req.method == 'GET' && req.url.path.endsWith('index.json')) {
      return http.StreamedResponse(const Stream.empty(), 404);
    }
    if (req.method == 'GET') return slowBody(200);
    await body.drain<void>();
    return http.StreamedResponse(const Stream.empty(), 201);
  });
}

Future<Directory> tmpDir() => Directory.systemTemp.createTemp('dufs_test');

// Lets a flow that was started in the fake zone cross several real-I/O
// awaits: each round lets the event loop deliver one completion, then a
// pump runs its continuation up to the next await.
Future<void> settleIo(WidgetTester tester, {int rounds = 6}) async {
  for (var i = 0; i < rounds; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
  }
}
