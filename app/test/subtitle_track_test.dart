import 'package:dufs_client/util/subtitle_track.dart';
import 'package:flutter_test/flutter_test.dart';

SubtitleTrackInfo _t(
  String id, {
  String language = '',
  String title = '',
  bool isDefault = false,
  bool isForced = false,
}) =>
    SubtitleTrackInfo(
      id: id,
      language: language,
      title: title,
      isDefault: isDefault,
      isForced: isForced,
    );

void main() {
  group('isEnglish', () {
    test('accepts the tags seen in the wild, case-insensitively', () {
      for (final tag in ['en', 'eng', 'English', 'EN-US', 'en-gb']) {
        expect(isEnglish(tag), isTrue, reason: tag);
      }
    });

    test('rejects other languages and empty tags', () {
      for (final tag in ['', 'jpn', 'pol', 'spa', 'e']) {
        expect(isEnglish(tag), isFalse, reason: tag);
      }
    });
  });

  group('looksForcedTitle', () {
    test('matches the library conventions', () {
      expect(looksForcedTitle('signs/songs'), isTrue);
      expect(looksForcedTitle('Forced'), isTrue);
      expect(looksForcedTitle('English (forced)'), isTrue);
    });

    test('leaves normal titles alone', () {
      expect(looksForcedTitle(''), isFalse);
      expect(looksForcedTitle('English subs'), isFalse);
      expect(looksForcedTitle('NF'), isFalse);
    });
  });

  group('subtitleLabel', () {
    test('expands known language tags', () {
      expect(subtitleLabel(_t('2', language: 'pol', title: 'NF')),
          'Polish — NF');
      expect(subtitleLabel(_t('5', language: 'jpn', title: '日本語')),
          'Japanese — 日本語');
    });

    test('falls back to the raw tag when unknown', () {
      expect(subtitleLabel(_t('9', language: 'xyz')), 'xyz');
    });

    test('uses language alone when there is no title', () {
      expect(subtitleLabel(_t('2', language: 'eng')), 'English');
    });

    test('uses the title alone when there is no language', () {
      expect(subtitleLabel(_t('2', title: 'Commentary')), 'Commentary');
    });

    test('does not repeat a title identical to the language name', () {
      expect(subtitleLabel(_t('2', language: 'eng', title: 'English')),
          'English');
    });

    test('marks forced tracks', () {
      expect(
        subtitleLabel(
          _t('4', language: 'eng', title: 'signs/songs', isForced: true),
        ),
        'English — signs/songs (forced)',
      );
    });

    test('falls back to the track handle when nothing is labelled', () {
      expect(subtitleLabel(_t('7')), 'Track 7');
    });
  });

  group('pickDefaultSubtitle', () {
    test('returns null when there are no tracks', () {
      expect(pickDefaultSubtitle([]), isNull);
    });

    test('prefers English over a default-flagged Japanese track', () {
      // [Foxtrot] Look Back (2024) flags BOTH eng and jpn as default.
      final tracks = [
        _t('5', language: 'jpn', title: '日本語', isDefault: true),
        _t('3', language: 'eng', title: 'Foxtrot', isDefault: true),
      ];
      expect(pickDefaultSubtitle(tracks)?.id, '3');
    });

    test('prefers a default-flagged English track over another English one',
        () {
      final tracks = [
        _t('8', language: 'eng', title: 'Commentary'),
        _t('3', language: 'eng', title: 'Foxtrot', isDefault: true),
      ];
      expect(pickDefaultSubtitle(tracks)?.id, '3');
    });

    test('takes the first English track when none is flagged', () {
      final tracks = [
        _t('2', language: 'eng', title: 'NF'),
        _t('9', language: 'eng', title: 'Other'),
      ];
      expect(pickDefaultSubtitle(tracks)?.id, '2');
    });

    test('never auto-selects a forced signs-only track', () {
      final tracks = [
        _t('4', language: 'eng', title: 'signs/songs', isForced: true),
        _t('3', language: 'eng', title: 'Foxtrot'),
      ];
      expect(pickDefaultSubtitle(tracks)?.id, '3');
    });

    test('falls back to a default-flagged track when there is no English', () {
      final tracks = [
        _t('11', language: 'pol', title: 'NF'),
        _t('10', language: 'jpn', title: 'NF', isDefault: true),
      ];
      expect(pickDefaultSubtitle(tracks)?.id, '10');
    });

    test('stays off rather than guessing a language', () {
      // The 17-track Erai-raws shape minus English: picking Thai would be
      // worse than showing nothing.
      final tracks = [
        _t('11', language: 'pol', title: 'NF'),
        _t('14', language: 'tha', title: 'NF'),
      ];
      expect(pickDefaultSubtitle(tracks), isNull);
    });

    test('ignores a forced track even when it is the only default', () {
      final tracks = [
        _t('4',
            language: 'jpn',
            title: 'forced',
            isDefault: true,
            isForced: true),
      ];
      expect(pickDefaultSubtitle(tracks), isNull);
    });
  });
}
