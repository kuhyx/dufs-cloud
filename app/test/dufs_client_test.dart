import 'dart:convert';

import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String _xml = '''
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/Media/2026/07/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype>
    </D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/Media/2026/07/sub/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype>
    </D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/Media/2026/07/a%20b.jpg</D:href>
    <D:propstat><D:prop><D:resourcetype/>
    <D:getcontentlength>2048</D:getcontentlength></D:prop></D:propstat>
  </D:response>
  <D:response><D:href></D:href></D:response>
</D:multistatus>
''';

DufsClient clientWith(MockClient mock) => DufsClient(
      baseUrl: 'https://host/',
      username: 'u',
      password: 'p',
      httpClient: mock,
    );

void main() {
  group('parsePropfind', () {
    test('parses entries, skips self and empty href, sorts dirs first', () {
      final entries = parsePropfind(_xml, '/Media/2026/07');
      expect(entries.map((e) => e.name), ['sub', 'a b.jpg']);
      final file = entries.firstWhere((e) => e.name == 'a b.jpg');
      expect(file.kind, EntryKind.file);
      expect(file.size, 2048);
      expect(entries.firstWhere((e) => e.name == 'sub').isDir, isTrue);
    });

    test('missing size becomes 0', () {
      const xml = '''
<D:multistatus xmlns:D="DAV:">
  <D:response><D:href>/x.bin</D:href><D:propstat><D:prop>
  <D:resourcetype/></D:prop></D:propstat></D:response>
</D:multistatus>''';
      final entries = parsePropfind(xml, '/');
      expect(entries.single.name, 'x.bin');
      expect(entries.single.size, 0);
    });

    test('parses getlastmodified into mtimeMs (0 when absent/invalid)', () {
      const xml = '''
<D:multistatus xmlns:D="DAV:">
  <D:response><D:href>/a.bin</D:href><D:propstat><D:prop><D:resourcetype/>
  <D:getlastmodified>Sun, 12 Jul 2026 17:23:07 GMT</D:getlastmodified>
  </D:prop></D:propstat></D:response>
  <D:response><D:href>/b.bin</D:href><D:propstat><D:prop><D:resourcetype/>
  <D:getlastmodified>garbage</D:getlastmodified></D:prop></D:propstat></D:response>
  <D:response><D:href>/c.bin</D:href><D:propstat><D:prop><D:resourcetype/>
  </D:prop></D:propstat></D:response>
</D:multistatus>''';
      final byName = {for (final e in parsePropfind(xml, '/')) e.name: e};
      expect(byName['a.bin']!.mtimeMs,
          DateTime.utc(2026, 7, 12, 17, 23, 7).millisecondsSinceEpoch);
      expect(byName['b.bin']!.mtimeMs, 0);
      expect(byName['c.bin']!.mtimeMs, 0);
    });
  });

  group('DirEntry', () {
    DirEntry make(String name) =>
        DirEntry(name: name, path: '/$name', kind: EntryKind.file, size: 0);

    test('classifies images, videos, text and other', () {
      expect(make('a.PNG').isImage, isTrue);
      expect(make('a.mp4').isVideo, isTrue);
      expect(make('a.md').isText, isTrue);
      expect(make('a.txt').isImage, isFalse);
      expect(make('a.bin').isText, isFalse);
      expect(make('noext').isVideo, isFalse);
      expect(make('trailingdot.').isImage, isFalse);
    });
  });

  group('DufsClient URLs', () {
    test('encodes segments and strips a trailing slash on the base', () {
      final client = DufsClient(
        baseUrl: 'https://host/',
        username: 'u',
        password: 'p',
      );
      expect(client.fileUri('/Media/a b.jpg').toString(),
          'https://host/Media/a%20b.jpg');
      expect(client.authHeaders['authorization'],
          'Basic ${base64Encode(utf8.encode('u:p'))}');
      client.close();
    });

    test('tolerates a base URL without a trailing slash', () {
      final client = DufsClient(
        baseUrl: 'https://host',
        username: 'u',
        password: 'p',
      );
      expect(client.fileUri('/x').toString(), 'https://host/x');
      client.close();
    });
  });

  group('DufsClient requests', () {
    test('list() PROPFINDs and returns parsed entries', () async {
      late http.BaseRequest seen;
      final client = clientWith(MockClient((req) async {
        seen = req;
        return http.Response(_xml, 207);
      }));
      final entries = await client.list('/Media/2026/07');
      expect(seen.method, 'PROPFIND');
      expect(seen.headers['depth'], '1');
      expect(entries.length, 2);
    });

    test('list() throws on an error status', () async {
      final client =
          clientWith(MockClient((_) async => http.Response('', 404)));
      await expectLater(client.list('/x'), throwsException);
    });

    test('upload() PUTs to dir/name and joins a trailing slash', () async {
      final seen = <String>[];
      final client = clientWith(MockClient((req) async {
        seen.add(req.url.path);
        return http.Response('', 201);
      }));
      await client.upload('/dir', 'n.txt', Stream.value([1, 2, 3]), 3);
      await client.upload('/dir/', 'm.txt', Stream.value([4]), 1);
      expect(seen, ['/dir/n.txt', '/dir/m.txt']);
    });

    test('upload() streams the body with Content-Length and progress',
        () async {
      var length = -1;
      final body = <int>[];
      final client = clientWith(MockClient.streaming((req, bytes) async {
        length = req.contentLength ?? -1;
        body.addAll(await bytes.expand((c) => c).toList());
        return http.StreamedResponse(const Stream.empty(), 201);
      }));
      final ticks = <int>[];
      await client.upload(
        '/d',
        'n',
        Stream.fromIterable([
          [1, 2],
          [3],
          [4, 5, 6],
        ]),
        6,
        onProgress: ticks.add,
      );
      expect(length, 6);
      expect(body, [1, 2, 3, 4, 5, 6]);
      expect(ticks, [2, 3, 6]);
    });

    test('upload() sends an unknown size as chunked (no Content-Length)',
        () async {
      int? length = 0;
      final client = clientWith(MockClient.streaming((req, bytes) async {
        length = req.contentLength;
        await bytes.drain<void>();
        return http.StreamedResponse(const Stream.empty(), 201);
      }));
      await client.upload('/d', 'n', Stream.value([1]), 0);
      expect(length, isNull);
    });

    test('upload() throws on an error status', () async {
      final client =
          clientWith(MockClient((_) async => http.Response('', 500)));
      await expectLater(
        client.upload('/d', 'n', Stream.value([0]), 1),
        throwsException,
      );
    });

    test('upload() stops pumping once an early error response arrives',
        () async {
      // The server rejects before reading the body (e.g. 401): the pump must
      // not keep feeding a dead connection until the whole file is read.
      final client = clientWith(MockClient.streaming((req, bytes) async {
        return http.StreamedResponse(const Stream.empty(), 401);
      }));
      var produced = 0;
      Stream<List<int>> endless() async* {
        while (true) {
          produced++;
          await Future<void>.delayed(Duration.zero);
          yield [0];
        }
      }

      await expectLater(
        client.upload('/d', 'n', endless(), 1 << 30),
        throwsException,
      );
      expect(produced, lessThan(1000));
    });

    test('upload() cancel stops the body and throws TransferCancelled',
        () async {
      final cancel = TransferCancel();
      final client = clientWith(MockClient.streaming((req, bytes) async {
        await bytes.drain<void>();
        return http.StreamedResponse(const Stream.empty(), 201);
      }));
      var produced = 0;
      Stream<List<int>> source() async* {
        for (var i = 0; i < 100; i++) {
          produced++;
          yield [i];
        }
      }

      await expectLater(
        client.upload(
          '/d',
          'n',
          source(),
          100,
          cancel: cancel,
          onProgress: (sent) {
            if (sent >= 3) cancel.cancel();
          },
        ),
        throwsA(isA<TransferCancelled>()),
      );
      expect(produced, lessThan(100));
    });

    test('download() hands chunks to onChunk with a running byte count',
        () async {
      final ok = clientWith(MockClient.streaming((req, _) async {
        return http.StreamedResponse(
          Stream.fromIterable([
            [9, 9],
            [8],
          ]),
          200,
        );
      }));
      final got = <int>[];
      final ticks = <int>[];
      await ok.download('/f', onChunk: got.addAll, onProgress: ticks.add);
      expect(got, [9, 9, 8]);
      expect(ticks, [2, 3]);
      final bad = clientWith(MockClient((_) async => http.Response('', 403)));
      await expectLater(
        bad.download('/f', onChunk: (_) {}),
        throwsException,
      );
    });

    test('download() cancel tears the stream down between chunks', () async {
      final cancel = TransferCancel();
      var produced = 0;
      Stream<List<int>> body() async* {
        for (var i = 0; i < 100; i++) {
          produced++;
          yield [i];
        }
      }

      final client = clientWith(MockClient.streaming((req, _) async {
        return http.StreamedResponse(body(), 200);
      }));
      final got = <int>[];
      await expectLater(
        client.download(
          '/f',
          onChunk: got.addAll,
          onProgress: (n) {
            if (n >= 2) cancel.cancel();
          },
          cancel: cancel,
        ),
        throwsA(isA<TransferCancelled>()),
      );
      expect(got, [0, 1]);
      expect(produced, lessThan(100));
    });

    test('delete() succeeds and throws on error', () async {
      final ok = clientWith(MockClient((_) async => http.Response('', 204)));
      await ok.delete('/f');
      final bad = clientWith(MockClient((_) async => http.Response('', 404)));
      await expectLater(bad.delete('/f'), throwsException);
    });

    test('createDir() MKCOLs and throws on error', () async {
      String? method;
      final ok = clientWith(MockClient((req) async {
        method = req.method;
        return http.Response('', 201);
      }));
      await ok.createDir('/New');
      expect(method, 'MKCOL');
      final bad = clientWith(MockClient((_) async => http.Response('', 409)));
      await expectLater(bad.createDir('/New'), throwsException);
    });

    test('move() MOVEs with Destination + Overwrite and throws on error',
        () async {
      late http.BaseRequest seen;
      final ok = clientWith(MockClient((req) async {
        seen = req;
        return http.Response('', 204);
      }));
      await ok.move('/a/pic.jpg', '/b');
      expect(seen.method, 'MOVE');
      expect(seen.headers['destination'], 'https://host/b/pic.jpg');
      expect(seen.headers['overwrite'], 'F');
      final bad = clientWith(MockClient((_) async => http.Response('', 412)));
      await expectLater(bad.move('/a/x', '/b'), throwsException);
    });

    test('rename() MOVEs to a new name in the same dir and throws on error',
        () async {
      late http.BaseRequest seen;
      final ok = clientWith(MockClient((req) async {
        seen = req;
        return http.Response('', 204);
      }));
      await ok.rename('/a/old.jpg', 'new.jpg');
      expect(seen.method, 'MOVE');
      expect(seen.headers['destination'], 'https://host/a/new.jpg');
      expect(seen.headers['overwrite'], 'F');
      final bad = clientWith(MockClient((_) async => http.Response('', 412)));
      await expectLater(bad.rename('/a/x', 'y'), throwsException);
    });

    test('readText() returns the body and throws on error', () async {
      final ok = clientWith(MockClient((_) async => http.Response('hi', 200)));
      expect(await ok.readText('/n.txt'), 'hi');
      final bad = clientWith(MockClient((_) async => http.Response('', 404)));
      await expectLater(bad.readText('/n.txt'), throwsException);
    });

    test('writeText() PUTs and throws on error', () async {
      String? body;
      final ok = clientWith(MockClient((req) async {
        body = req.body;
        return http.Response('', 200);
      }));
      await ok.writeText('/n.txt', 'new');
      expect(body, 'new');
      final bad = clientWith(MockClient((_) async => http.Response('', 500)));
      await expectLater(bad.writeText('/n.txt', 'x'), throwsException);
    });

    test('fetchMeta() parses the index and is tolerant of failure', () async {
      final ok = clientWith(MockClient((_) async => http.Response(
          '{"entries":{"/a.mp4":{"durationMs":5000}}}', 200)));
      final meta = await ok.fetchMeta();
      expect(meta['/a.mp4']?.durationMs, 5000);
      // non-ok status
      final missing =
          clientWith(MockClient((_) async => http.Response('', 404)));
      expect(await missing.fetchMeta(), isEmpty);
      // bad JSON
      final bad =
          clientWith(MockClient((_) async => http.Response('not json', 200)));
      expect(await bad.fetchMeta(), isEmpty);
      // network failure
      final offline =
          clientWith(MockClient((_) async => throw Exception('offline')));
      expect(await offline.fetchMeta(), isEmpty);
    });

    test('thumbUri() points at the .thumbs mirror', () {
      final client =
          clientWith(MockClient((_) async => http.Response('', 200)));
      expect(client.thumbUri('/Media/a b.jpg').toString(),
          'https://host/.thumbs/Media/a%20b.jpg.jpg');
    });
  });
}
