import 'package:dufs_client/services/cloud_index.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Builds a WebDAV multistatus body for [self] listing [children]
/// (name, isDir).
String _xml(String self, List<(String, bool)> children) {
  final selfHref = self == '/' ? '/' : '$self/';
  final base = self == '/' ? '' : self;
  final sb = StringBuffer('<D:multistatus xmlns:D="DAV:">')
    ..write('<D:response><D:href>$selfHref</D:href><D:propstat><D:prop>'
        '<D:resourcetype><D:collection/></D:resourcetype>'
        '</D:prop></D:propstat></D:response>');
  for (final (name, isDir) in children) {
    final href = isDir ? '$base/$name/' : '$base/$name';
    final rt = isDir ? '<D:collection/>' : '';
    sb.write('<D:response><D:href>$href</D:href><D:propstat><D:prop>'
        '<D:resourcetype>$rt</D:resourcetype>'
        '<D:getcontentlength>10</D:getcontentlength>'
        '</D:prop></D:propstat></D:response>');
  }
  sb.write('</D:multistatus>');
  return sb.toString();
}

DufsClient _client(
  Map<String, List<(String, bool)>> tree, {
  Set<String> fail = const {},
  List<String>? seen,
}) =>
    DufsClient(
      baseUrl: 'https://host',
      username: 'u',
      password: 'p',
      httpClient: MockClient((req) async {
        final path = Uri.decodeComponent(req.url.path);
        seen?.add(path);
        if (fail.contains(path)) return http.Response('', 500);
        return http.Response(_xml(path, tree[path] ?? const []), 207);
      }),
    );

void main() {
  group('buildCloudIndex', () {
    test('walks the tree, skipping app/meta/thumbs/Keepass at any depth',
        () async {
      final seen = <String>[];
      final client = _client(
        {
          '/': [('Media', true), ('.thumbs', true), ('Keepass', true), ('root.txt', false)],
          '/Media': [('pic.jpg', false), ('assets', true)],
        },
        seen: seen,
      );
      final entries = await buildCloudIndex(client);
      final paths = entries.map((e) => e.path).toList();
      expect(paths, containsAll(<String>['/root.txt', '/Media', '/Media/pic.jpg']));
      expect(paths, isNot(contains('/.thumbs')));
      expect(paths, isNot(contains('/Keepass')));
      expect(paths, isNot(contains('/Media/assets')));
      // Skip-named dirs are never descended into.
      expect(seen, isNot(contains('/.thumbs')));
      expect(seen, isNot(contains('/Media/assets')));
    });

    test('skips a folder whose listing fails, keeps the rest', () async {
      final client = _client(
        {
          '/': [('Bad', true), ('ok.txt', false)],
        },
        fail: {'/Bad'},
      );
      final entries = await buildCloudIndex(client);
      expect(entries.map((e) => e.path), contains('/ok.txt'));
    });

    test('root failure yields an empty index', () async {
      final client = _client(const {}, fail: {'/'});
      expect(await buildCloudIndex(client), isEmpty);
    });
  });
}
