import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
import 'package:dufs_client/util/cloud_stats.dart';
import 'package:flutter_test/flutter_test.dart';

DirEntry _file(String path, {int size = 0}) => DirEntry(
      name: path.substring(path.lastIndexOf('/') + 1),
      path: path,
      kind: EntryKind.file,
      size: size,
    );
DirEntry _dir(String path) => DirEntry(
    name: path.substring(path.lastIndexOf('/') + 1),
    path: path,
    kind: EntryKind.dir,
    size: 0);

void main() {
  group('availableExtensions', () {
    test('distinct sorted file extensions, ignoring dirs/extensionless', () {
      final es = [_file('/a.JPG'), _file('/b.mp4'), _file('/c.jpg'),
          _file('/README'), _dir('/Media')];
      expect(availableExtensions(es), ['jpg', 'mp4']);
    });
    test('empty when nothing has an extension', () {
      expect(availableExtensions([_dir('/M'), _file('/LICENSE')]), isEmpty);
    });
  });

  group('sizeValues', () {
    test('ascending file sizes, skipping dirs', () {
      final es = [_dir('/M'), _file('/a', size: 10), _file('/b', size: 500),
          _file('/c', size: 3)];
      expect(sizeValues(es), [3, 10, 500]);
    });
    test('empty when no files', () {
      expect(sizeValues([_dir('/M')]), isEmpty);
    });
  });

  group('durationValues', () {
    final meta = <String, MediaMeta>{
      '/a.mp4': const MediaMeta(durationMs: 5000),
      '/b.mp4': const MediaMeta(durationMs: 92000),
      '/c.mp4': const MediaMeta(durationMs: 30000),
    };
    test('ascending known durations, skipping unindexed', () {
      final es = [_file('/a.mp4'), _file('/b.mp4'), _file('/c.mp4'), _file('/x.mp4')];
      expect(durationValues(es, meta), [5000, 30000, 92000]);
    });
    test('empty when none indexed', () {
      expect(durationValues([_file('/x.mp4')], meta), isEmpty);
    });
  });

  group('groupByFolder', () {
    test('groups by folder, sorted by path, order preserved within', () {
      final groups = groupByFolder([
        _file('/Media/2026/b.jpg'),
        _file('/Docs/a.pdf'),
        _file('/Media/2026/a.jpg'),
      ]);
      expect(groups.map((g) => g.folder), ['/Docs', '/Media/2026']);
      expect(groups.map((g) => g.entries.map((e) => e.name).toList()), [
        ['a.pdf'],
        ['b.jpg', 'a.jpg'],
      ]);
    });
    test('empty for no entries', () {
      expect(groupByFolder([]), isEmpty);
    });
  });
}
