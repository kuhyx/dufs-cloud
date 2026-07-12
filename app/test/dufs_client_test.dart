import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter_test/flutter_test.dart';

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
</D:multistatus>
''';

void main() {
  group('parsePropfind', () {
    test('parses entries, skips self, decodes names, reads size', () {
      final entries = parsePropfind(_xml, '/Media/2026/07');
      expect(entries.map((e) => e.name), ['sub', 'a b.jpg']);
      final file = entries.firstWhere((e) => e.name == 'a b.jpg');
      expect(file.kind, EntryKind.file);
      expect(file.size, 2048);
      expect(entries.firstWhere((e) => e.name == 'sub').isDir, isTrue);
    });
  });

  group('DirEntry', () {
    DirEntry make(String name) =>
        DirEntry(name: name, path: '/$name', kind: EntryKind.file, size: 0);

    test('classifies images and videos', () {
      expect(make('a.PNG').isImage, isTrue);
      expect(make('a.mp4').isVideo, isTrue);
      expect(make('a.txt').isImage, isFalse);
      expect(make('noext').isVideo, isFalse);
    });
  });

  group('DufsClient', () {
    test('builds encoded authenticated file URLs', () {
      final client = DufsClient(
        baseUrl: 'https://host/',
        username: 'u',
        password: 'p',
      );
      expect(
        client.fileUri('/Media/a b.jpg').toString(),
        'https://host/Media/a%20b.jpg',
      );
      expect(client.authHeaders['authorization'], startsWith('Basic '));
      client.close();
    });
  });
}
