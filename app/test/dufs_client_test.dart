import 'dart:convert';

import 'package:dufs_client/models/dir_entry.dart';
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
  });

  group('DirEntry', () {
    DirEntry make(String name) =>
        DirEntry(name: name, path: '/$name', kind: EntryKind.file, size: 0);

    test('classifies images, videos and other', () {
      expect(make('a.PNG').isImage, isTrue);
      expect(make('a.mp4').isVideo, isTrue);
      expect(make('a.txt').isImage, isFalse);
      expect(make('a.txt').isVideo, isFalse);
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
      await client.upload('/dir', 'n.txt', [1, 2, 3]);
      await client.upload('/dir/', 'm.txt', [4]);
      expect(seen, ['/dir/n.txt', '/dir/m.txt']);
    });

    test('upload() throws on an error status', () async {
      final client =
          clientWith(MockClient((_) async => http.Response('', 500)));
      await expectLater(client.upload('/d', 'n', [0]), throwsException);
    });

    test('download() returns bytes and throws on error', () async {
      final ok = clientWith(
        MockClient((_) async => http.Response.bytes([9, 9], 200)),
      );
      expect(await ok.download('/f'), [9, 9]);
      final bad = clientWith(MockClient((_) async => http.Response('', 403)));
      await expectLater(bad.download('/f'), throwsException);
    });

    test('delete() succeeds and throws on error', () async {
      final ok = clientWith(MockClient((_) async => http.Response('', 204)));
      await ok.delete('/f');
      final bad = clientWith(MockClient((_) async => http.Response('', 404)));
      await expectLater(bad.delete('/f'), throwsException);
    });
  });
}
