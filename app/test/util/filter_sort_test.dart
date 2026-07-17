import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
import 'package:dufs_client/util/filter_sort.dart';
import 'package:flutter_test/flutter_test.dart';

DirEntry _file(String name, {int size = 0, int mtime = 0}) => DirEntry(
      name: name,
      path: '/$name',
      kind: EntryKind.file,
      size: size,
      mtimeMs: mtime,
    );
DirEntry _dir(String name) =>
    DirEntry(name: name, path: '/$name', kind: EntryKind.dir, size: 0);

List<String> _names(List<DirEntry> es) => es.map((e) => e.name).toList();

void main() {
  final meta = <String, MediaMeta>{
    '/short.mp4': const MediaMeta(durationMs: 5000, createdMs: 100, uploadedMs: 200),
    '/long.mp4': const MediaMeta(durationMs: 60000, createdMs: 50, uploadedMs: 400),
  };
  final entries = [
    _dir('Album'),
    _file('photo.jpg', size: 2000, mtime: 30),
    _file('short.mp4', size: 500, mtime: 10),
    _file('long.mp4', size: 9000, mtime: 20),
    _file('notes.txt', size: 10, mtime: 5),
  ];

  group('fuzzyMatch', () {
    test('subsequence, case-insensitive, empty matches', () {
      expect(fuzzyMatch('', 'anything'), isTrue);
      expect(fuzzyMatch('pcj', 'pic.jpg'), isTrue);
      expect(fuzzyMatch('zzz', 'pic.jpg'), isFalse);
    });
  });

  group('categoryOf', () {
    test('maps each kind', () {
      expect(categoryOf(_dir('D')), TypeFilter.folder);
      expect(categoryOf(_file('a.jpg')), TypeFilter.image);
      expect(categoryOf(_file('a.mp4')), TypeFilter.video);
      expect(categoryOf(_file('a.md')), TypeFilter.text);
      expect(categoryOf(_file('a.bin')), TypeFilter.other);
    });
  });

  group('isFilterActive', () {
    test('false for default, true for each field', () {
      expect(isFilterActive(defaultFilter), isFalse);
      expect(isFilterActive(defaultFilter.copyWith(query: 'x')), isTrue);
      expect(isFilterActive(defaultFilter.copyWith(type: TypeFilter.image)),
          isTrue);
      expect(
          isFilterActive(defaultFilter.copyWith(extIncludes: ['jpg'])), isTrue);
      expect(
          isFilterActive(defaultFilter.copyWith(extExcludes: ['jpg'])), isTrue);
      expect(isFilterActive(defaultFilter.copyWith(minSize: 1)), isTrue);
      expect(isFilterActive(defaultFilter.copyWith(maxSize: 1)), isTrue);
      expect(isFilterActive(defaultFilter.copyWith(minDurationMs: 1)), isTrue);
      expect(isFilterActive(defaultFilter.copyWith(maxDurationMs: 1)), isTrue);
      expect(isFilterActive(defaultFilter.copyWith(minPixels: 1)), isTrue);
      expect(isFilterActive(defaultFilter.copyWith(maxPixels: 1)), isTrue);
    });
  });

  group('copyWith', () {
    test('keeps nullable bounds by default, sets them when passed (incl null)',
        () {
      const base = FilterState(
          minSize: 5,
          maxSize: 6,
          minDurationMs: 7,
          maxDurationMs: 8,
          minPixels: 9,
          maxPixels: 10);
      // keep branch: nothing passed → all bounds retained.
      final kept = base.copyWith(query: 'q');
      expect([
        kept.minSize,
        kept.maxSize,
        kept.minDurationMs,
        kept.maxDurationMs,
        kept.minPixels,
        kept.maxPixels,
      ], [5, 6, 7, 8, 9, 10]);
      // set branch: pass explicit values including null.
      final set = base.copyWith(
          minSize: 1,
          maxSize: null,
          minDurationMs: 2,
          maxDurationMs: null,
          minPixels: 3,
          maxPixels: null);
      expect([
        set.minSize,
        set.maxSize,
        set.minDurationMs,
        set.maxDurationMs,
        set.minPixels,
        set.maxPixels,
      ], [1, null, 2, null, 3, null]);
    });
    test('SortState copyWith', () {
      const s = SortState(key: SortKey.size, dir: SortDir.desc);
      expect(s.copyWith(key: SortKey.name).key, SortKey.name);
      expect(s.copyWith(dir: SortDir.asc).dir, SortDir.asc);
      expect(s.copyWith().key, SortKey.size);
    });
  });

  group('applyFilterSort — filtering', () {
    test('type keeps only that category (folders excluded)', () {
      final out = applyFilterSort(
          entries, meta,
          defaultFilter.copyWith(type: TypeFilter.image), defaultSort);
      expect(_names(out), ['photo.jpg']);
    });
    test('folder type keeps only folders', () {
      final out = applyFilterSort(entries, meta,
          defaultFilter.copyWith(type: TypeFilter.folder), defaultSort);
      expect(_names(out), ['Album']);
    });
    test('include extensions (folders pass through)', () {
      final out = applyFilterSort(entries, meta,
          defaultFilter.copyWith(extIncludes: ['mp4']), defaultSort);
      expect(_names(out), ['Album', 'long.mp4', 'short.mp4']);
    });
    test('include multiple extensions', () {
      final out = applyFilterSort(entries, meta,
          defaultFilter.copyWith(extIncludes: ['jpg', 'txt']), defaultSort);
      expect(_names(out), ['Album', 'notes.txt', 'photo.jpg']);
    });
    test('exclude drops matching, keeps extensionless', () {
      final out = applyFilterSort([...entries, _file('README')], meta,
          defaultFilter.copyWith(extExcludes: ['mp4']), defaultSort);
      expect(_names(out), ['Album', 'notes.txt', 'photo.jpg', 'README']);
    });
    test('size range excludes files outside the bounds', () {
      final out = applyFilterSort(entries, meta,
          defaultFilter.copyWith(minSize: 400, maxSize: 3000), defaultSort);
      expect(_names(out), ['Album', 'photo.jpg', 'short.mp4']);
    });
    test('duration range needs an indexed duration in range', () {
      final out = applyFilterSort(
          entries,
          meta,
          defaultFilter.copyWith(minDurationMs: 1000, maxDurationMs: 10000),
          defaultSort);
      expect(_names(out), ['Album', 'short.mp4']);
    });
  });

  group('applyFilterSort — sorting', () {
    test('by name asc/desc, dirs first', () {
      final asc = applyFilterSort(entries, meta, defaultFilter, defaultSort);
      expect(_names(asc),
          ['Album', 'long.mp4', 'notes.txt', 'photo.jpg', 'short.mp4']);
      final desc = applyFilterSort(entries, meta, defaultFilter,
          const SortState(dir: SortDir.desc));
      // Dirs still cluster first even descending.
      expect(desc.first.name, 'Album');
    });
    test('by size, modified, extension, type', () {
      int idx(List<DirEntry> l, String n) => _names(l).indexOf(n);
      final bySize = applyFilterSort(
          entries, meta, defaultFilter, const SortState(key: SortKey.size));
      expect(idx(bySize, 'notes.txt'), lessThan(idx(bySize, 'long.mp4')));
      final byMod = applyFilterSort(
          entries, meta, defaultFilter, const SortState(key: SortKey.modified));
      expect(idx(byMod, 'notes.txt'), lessThan(idx(byMod, 'photo.jpg')));
      final byExt = applyFilterSort(
          entries, meta, defaultFilter,
          const SortState(key: SortKey.extension));
      expect(byExt.first.name, 'Album');
      final byType = applyFilterSort(
          entries, meta, defaultFilter, const SortState(key: SortKey.type));
      expect(byType.first.name, 'Album');
    });
    test('by created, uploaded, duration (from the index)', () {
      int idx(List<DirEntry> l, String n) => _names(l).indexOf(n);
      final byCreated = applyFilterSort(
          entries, meta, defaultFilter, const SortState(key: SortKey.created));
      // long.mp4 createdMs 50 < short.mp4 100.
      expect(idx(byCreated, 'long.mp4'), lessThan(idx(byCreated, 'short.mp4')));
      final byUploaded = applyFilterSort(
          entries, meta, defaultFilter, const SortState(key: SortKey.uploaded));
      expect(
          idx(byUploaded, 'short.mp4'), lessThan(idx(byUploaded, 'long.mp4')));
      final byDur = applyFilterSort(
          entries, meta, defaultFilter, const SortState(key: SortKey.duration));
      expect(idx(byDur, 'short.mp4'), lessThan(idx(byDur, 'long.mp4')));
    });
  });

  group('resolution', () {
    const meta = <String, MediaMeta>{
      '/big.jpg': MediaMeta(width: 4000, height: 3000), // 12 MP
      '/small.jpg': MediaMeta(width: 640, height: 480), // ~0.3 MP
    };
    final entries = [_file('big.jpg'), _file('small.jpg'), _file('none.jpg')];
    int idx(List<DirEntry> es, String n) => es.indexWhere((e) => e.name == n);

    test('min/max pixel filter; unknown dimensions excluded', () {
      expect(
          applyFilterSort(entries, meta,
                  const FilterState(minPixels: 1000000), defaultSort)
              .map((e) => e.name),
          ['big.jpg']);
      expect(
          applyFilterSort(entries, meta,
                  const FilterState(maxPixels: 1000000), defaultSort)
              .map((e) => e.name),
          ['small.jpg']);
    });

    test('sorts by resolution (unknown counts as 0)', () {
      final byRes = applyFilterSort(entries, meta, defaultFilter,
          const SortState(key: SortKey.resolution));
      expect(idx(byRes, 'none.jpg'), lessThan(idx(byRes, 'small.jpg')));
      expect(idx(byRes, 'small.jpg'), lessThan(idx(byRes, 'big.jpg')));
    });
  });
}
