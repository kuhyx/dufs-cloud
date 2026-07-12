import 'package:dufs_client/models/media_meta.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('MediaMeta.fromJson', () {
    test('reads numeric fields, tolerates missing/wrong types', () {
      final m = MediaMeta.fromJson(const {
        'width': 1920,
        'height': 1080,
        'durationMs': 92000,
        'createdMs': 100,
        'uploadedMs': 200,
      });
      expect([m.width, m.height, m.durationMs, m.createdMs, m.uploadedMs],
          [1920, 1080, 92000, 100, 200]);
      final bad = MediaMeta.fromJson(const {'width': 'x', 'durationMs': null});
      expect([bad.width, bad.durationMs], [null, null]);
      // doubles are coerced to int.
      expect(MediaMeta.fromJson(const {'durationMs': 3.0}).durationMs, 3);
    });
  });

  group('metaIndexFromJson', () {
    test('parses the entries map', () {
      final index = metaIndexFromJson(const {
        'generatedMs': 1,
        'entries': {
          '/a.mp4': {'durationMs': 5000},
        },
      });
      expect(index['/a.mp4']?.durationMs, 5000);
    });
    test('tolerates a non-map top level', () {
      expect(metaIndexFromJson('nope'), isEmpty);
      expect(metaIndexFromJson(null), isEmpty);
    });
    test('tolerates missing/wrong entries', () {
      expect(metaIndexFromJson(const {'entries': 5}), isEmpty);
      expect(metaIndexFromJson(const {}), isEmpty);
    });
    test('skips non-string keys and non-map values', () {
      final index = metaIndexFromJson(const {
        'entries': {
          '/ok.mp4': {'durationMs': 1},
          '/bad.mp4': 'not-a-map',
        },
      });
      expect(index.keys, ['/ok.mp4']);
    });
  });
}
