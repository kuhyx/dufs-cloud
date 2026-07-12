import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/services/download_zip.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

String _xml(String self, List<(String, bool)> children) {
  final base = self == '/' ? '' : self;
  final sb = StringBuffer('<D:multistatus xmlns:D="DAV:">');
  for (final (name, isDir) in children) {
    final href = isDir ? '$base/$name/' : '$base/$name';
    final rt = isDir ? '<D:collection/>' : '';
    sb.write('<D:response><D:href>$href</D:href><D:propstat><D:prop>'
        '<D:resourcetype>$rt</D:resourcetype></D:prop></D:propstat></D:response>');
  }
  sb.write('</D:multistatus>');
  return sb.toString();
}

DufsClient _client(Map<String, List<(String, bool)>> tree) => DufsClient(
      baseUrl: 'https://host',
      username: 'u',
      password: 'p',
      httpClient: MockClient((req) async {
        final path = Uri.decodeComponent(req.url.path);
        if (req.method == 'PROPFIND') {
          return http.Response(_xml(path, tree[path] ?? const []), 207);
        }
        return http.Response.bytes(utf8.encode('data-$path'), 200);
      }),
    );

DirEntry _f(String path) => DirEntry(
    name: path.substring(path.lastIndexOf('/') + 1),
    path: path,
    kind: EntryKind.file,
    size: 3);
DirEntry _d(String path) => DirEntry(
    name: path.substring(path.lastIndexOf('/') + 1),
    path: path,
    kind: EntryKind.dir,
    size: 0);

void main() {
  group('buildSelectionZip', () {
    test('packs root files as flat entries', () async {
      final zip = await buildSelectionZip(
          _client(const {}), '/', [_f('/a.txt'), _f('/b.txt')]);
      final archive = ZipDecoder().decodeBytes(zip);
      expect(archive.files.map((f) => f.name), ['a.txt', 'b.txt']);
      expect(utf8.decode(archive.files.first.content as List<int>), 'data-/a.txt');
    });

    test('recurses a folder, keeping paths relative to the base', () async {
      final client = _client({
        '/Media': [('forest.jpg', false), ('2026', true)],
        '/Media/2026': [('pic.jpg', false)],
      });
      final zip = await buildSelectionZip(client, '/', [_d('/Media')]);
      final names = ZipDecoder().decodeBytes(zip).files.map((f) => f.name);
      expect(names, containsAll(<String>['Media/forest.jpg', 'Media/2026/pic.jpg']));
    });

    test('names entries relative to a non-root base', () async {
      final zip = await buildSelectionZip(
          _client(const {}), '/Media', [_f('/Media/forest.jpg')]);
      expect(
          ZipDecoder().decodeBytes(zip).files.single.name, 'forest.jpg');
    });
  });
}
