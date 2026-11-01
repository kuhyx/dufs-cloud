import 'dart:convert';
import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/dufs_client_harness.dart';

void main() {
  group('parsePropfind', () {
    test('parses entries, skips self and empty href, sorts dirs first', () {
      final entries = parsePropfind(propfindXml, '/Media/2026/07');
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
      expect(
        byName['a.bin']!.mtimeMs,
        DateTime.utc(2026, 7, 12, 17, 23, 7).millisecondsSinceEpoch,
      );
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
      expect(
        client.fileUri('/Media/a b.jpg').toString(),
        'https://host/Media/a%20b.jpg',
      );
      expect(
        client.authHeaders['authorization'],
        'Basic ${base64Encode(utf8.encode('u:p'))}',
      );
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
}
