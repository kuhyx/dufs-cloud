import 'package:dufs_client/util/paths.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('extname', () {
    test('lower-cases and drops leading/no-extension dots', () {
      expect(extname('A.JPG'), 'jpg');
      expect(extname('a.b.c'), 'c');
      expect(extname('noext'), '');
      expect(extname('.hidden'), '');
      expect(extname('trailing.'), '');
    });
  });

  group('type checks', () {
    test('classify by extension', () {
      expect(isImage('p.PNG'), isTrue);
      expect(isVideo('c.mp4'), isTrue);
      expect(isText('n.md'), isTrue);
      expect(isImage('c.mp4'), isFalse);
      expect(isText('p.png'), isFalse);
    });
  });

  group('normalize / join / parent / basename', () {
    test('normalize resolves . and ..', () {
      expect(normalize('/a/./b/../c'), '/a/c');
      expect(normalize('a//b/'), '/a/b');
      expect(normalize('/'), '/');
      expect(normalize('/../x'), '/x');
    });
    test('joinPath', () {
      expect(joinPath('/a', 'b'), '/a/b');
      expect(joinPath('/', 'b'), '/b');
    });
    test('parentPath', () {
      expect(parentPath('/a/b/c'), '/a/b');
      expect(parentPath('/a'), '/');
      expect(parentPath('/'), '/');
    });
    test('basename', () {
      expect(basename('/a/b.jpg'), 'b.jpg');
      expect(basename('/'), '/');
    });
  });

  group('underPath', () {
    test('root contains everything', () {
      expect(underPath('/Media/x.jpg', '/'), isTrue);
    });
    test('matches the folder itself and descendants', () {
      expect(underPath('/Media/2026/07', '/Media/2026/07'), isTrue);
      expect(underPath('/Media/2026/07/pic.jpg', '/Media/2026/07'), isTrue);
    });
    test('does not let a prefix swallow a longer sibling', () {
      expect(underPath('/Media/0700/x.jpg', '/Media/07'), isFalse);
      expect(underPath('/Other/x.jpg', '/Media'), isFalse);
    });
  });

  group('crumbs', () {
    test('root only', () {
      final c = crumbs('/');
      expect(c.length, 1);
      expect(c.single.name, 'cloud');
      expect(c.single.path, '/');
    });
    test('nested path', () {
      final c = crumbs('/Media/2026');
      expect(c.map((e) => e.name), ['cloud', 'Media', '2026']);
      expect(c.map((e) => e.path), ['/', '/Media', '/Media/2026']);
    });
  });

  group('humanSize', () {
    test('formats across units', () {
      expect(humanSize(512), '512 B');
      expect(humanSize(1536), '1.5 KB');
      expect(humanSize(5 * 1024 * 1024), '5.0 MB');
      expect(humanSize(3 * 1024 * 1024 * 1024), '3.0 GB');
      expect(humanSize(2 * 1024 * 1024 * 1024 * 1024), '2.0 TB');
      expect(humanSize(50 * 1024), '50 KB');
    });
  });

  group('formatDuration', () {
    test('splits into h/m/s, dropping trailing zero units', () {
      expect(formatDuration(5073000), '1h 24m 33s');
      expect(formatDuration(90000), '1m 30s');
      expect(formatDuration(3600000), '1h');
      expect(formatDuration(45000), '45s');
      expect(formatDuration(0), '0s');
    });
  });

  group('movableInto', () {
    test('keeps items that can legally move into the destination', () {
      expect(
        movableInto(['/Media/pic.jpg', '/Media/clip.mp4'], '/Media/2026'),
        ['/Media/pic.jpg', '/Media/clip.mp4'],
      );
    });

    test('drops a folder dragged onto itself or into its own subtree', () {
      expect(movableInto(['/Media'], '/Media'), isEmpty);
      expect(movableInto(['/Media'], '/Media/2026/07'), isEmpty);
      // A sibling that merely shares a name prefix is still movable.
      expect(movableInto(['/Media'], '/Media2'), ['/Media']);
    });

    test('drops items already living directly in the destination', () {
      expect(movableInto(['/Media/pic.jpg'], '/Media'), isEmpty);
      // A trailing slash on the destination must not defeat the check.
      expect(movableInto(['/Media/pic.jpg'], '/Media/'), isEmpty);
      // Deeper descendants are not "already there" and may move up.
      expect(movableInto(['/Media/2026/pic.jpg'], '/Media'), [
        '/Media/2026/pic.jpg',
      ]);
    });

    test('keeps only the legal subset of a mixed drag', () {
      expect(
        movableInto(['/Media', '/notes.txt', '/Media/pic.jpg'], '/Media/2026'),
        ['/notes.txt', '/Media/pic.jpg'],
      );
    });
  });
}
