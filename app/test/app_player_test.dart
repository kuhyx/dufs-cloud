import 'package:dufs_client/services/app_player.dart';
import 'package:dufs_client/util/subtitle_track.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // Same call main.dart makes; libmpv is present on the host and CI runner.
  MediaKit.ensureInitialized();

  group('toTrackInfo', () {
    test('flattens a media_kit track', () {
      final info = toTrackInfo(
        const SubtitleTrack('3', 'Foxtrot', 'eng', isDefault: true),
      );
      expect(info.id, '3');
      expect(info.title, 'Foxtrot');
      expect(info.language, 'eng');
      expect(info.isDefault, isTrue);
      expect(info.isForced, isFalse);
    });

    test('substitutes empty strings for missing metadata', () {
      final info = toTrackInfo(const SubtitleTrack('7', null, null));
      expect(info.language, isEmpty);
      expect(info.title, isEmpty);
      expect(info.isDefault, isFalse);
    });

    test('infers forced from the title, since media_kit has no such flag', () {
      final info = toTrackInfo(const SubtitleTrack('4', 'signs/songs', 'eng'));
      expect(info.isForced, isTrue);
    });
  });

  group('subtitleInfosFrom', () {
    test('drops mpv placeholders and keeps real tracks', () {
      final infos = subtitleInfosFrom(
        const Tracks(
          video: [],
          audio: [],
          subtitle: [
            SubtitleTrack('auto', null, null),
            SubtitleTrack('no', null, null),
            SubtitleTrack('3', 'Foxtrot', 'eng', isDefault: true),
            SubtitleTrack('5', '日本語', 'jpn'),
          ],
        ),
      );
      expect(infos.map((t) => t.id), ['3', '5']);
      expect(infos.first.isDefault, isTrue);
    });

    test('a file with no subtitles yields nothing', () {
      final infos = subtitleInfosFrom(
        const Tracks(video: [], audio: [], subtitle: []),
      );
      expect(infos, isEmpty);
    });
  });

  group('isPlaceholderTrack', () {
    test('recognises mpv synthetic entries', () {
      expect(isPlaceholderTrack(SubtitleTrack.no()), isTrue);
      expect(isPlaceholderTrack(SubtitleTrack.auto()), isTrue);
    });

    test('leaves real tracks alone', () {
      expect(
        isPlaceholderTrack(const SubtitleTrack('2', null, 'eng')),
        isFalse,
      );
    });
  });

  group('MediaKitPlayer', () {
    test('opens with auth headers, reports tracks, switches them, disposes',
        () async {
      // Headless: with a video output attached, `open` would block on the
      // texture platform channel (see MediaKitPlayer's constructor).
      final player = MediaKitPlayer(attachVideo: false);

      // A dead host is fine — mpv still processes the commands, and nothing
      // here waits on real playback.
      await player.open(Uri.parse('http://127.0.0.1:1/clip.mkv'), const {
        'authorization': 'Basic dGVzdDp0ZXN0',
      });

      expect(player.subtitleTracks, isA<Stream<List<SubtitleTrackInfo>>>());
      expect(player.position, isA<Stream<Duration>>());
      expect(player.duration, isA<Stream<Duration>>());
      expect(player.playing, isA<Stream<bool>>());

      // Transport controls, as the audio screen drives them.
      await player.play();
      await player.seek(const Duration(seconds: 3));
      await player.pause();

      await player.setSubtitleTrack(
        const SubtitleTrackInfo(id: '3', language: 'eng', title: 'Foxtrot'),
      );
      await player.setSubtitleTrack(null); // "Off"

      await player.dispose();
    });

    test('builds a video surface from the attached output', () {
      // Not disposed: tearing down an attached video output also waits on the
      // texture platform channel. The player dies with the test isolate.
      final player = MediaKitPlayer();
      expect(player.buildSurface(), isA<Video>());
    });
  });
}
