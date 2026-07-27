/// The video-playback seam.
///
/// [AppPlayer] is the whole surface `VideoScreen` is allowed to touch, so the
/// screen's tests can drive a plain Dart fake instead of booting libmpv.
/// [MediaKitPlayer] is the only implementation that talks to the plugin, and
/// it stays deliberately thin: pure delegation, no logic worth testing twice.
library;

import 'package:dufs_client/util/subtitle_track.dart';
import 'package:flutter/widgets.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

/// Builds the player backing the video screen; injectable for tests.
typedef AppPlayerFactory = AppPlayer Function();

/// A video player able to stream authenticated HTTP and switch between the
/// subtitle tracks embedded in the file.
abstract class AppPlayer {
  /// Starts playing [uri], sending [headers] (dufs Basic auth) with it.
  Future<void> open(Uri uri, Map<String, String> headers);

  /// Emits the file's embedded subtitle tracks as they are demuxed.
  ///
  /// Matroska tracks are not known at open time, so this fires later — and
  /// more than once — rather than resolving with the first frame.
  Stream<List<SubtitleTrackInfo>> get subtitleTracks;

  /// Selects [track], or turns subtitles off when it is null.
  Future<void> setSubtitleTrack(SubtitleTrackInfo? track);

  /// Playback position, as it advances.
  Stream<Duration> get position;

  /// Total duration, once the demuxer knows it.
  Stream<Duration> get duration;

  /// Whether playback is currently running.
  Stream<bool> get playing;

  /// Resumes playback.
  Future<void> play();

  /// Pauses playback.
  Future<void> pause();

  /// Jumps to [to].
  Future<void> seek(Duration to);

  /// The video surface widget. Not used by audio-only playback.
  Widget buildSurface();

  /// Releases the native player.
  Future<void> dispose();
}

/// [AppPlayer] backed by media_kit (libmpv + libass), which renders the
/// library's embedded ASS subtitles with their original styling.
class MediaKitPlayer implements AppPlayer {
  /// Creates the underlying libmpv player, attaching a video output unless
  /// [attachVideo] is false.
  ///
  /// Pass false for audio-only playback, which needs no video texture, and in
  /// tests: the video output registers a native texture, and once attached
  /// every subsequent `open` blocks on a platform channel a `flutter test`
  /// host does not have. It must stay true for video — media_kit requires the
  /// output to be attached *before* `open` for the picture to render at all.
  MediaKitPlayer({bool attachVideo = true}) {
    _player = Player(configuration: _libassConfig);
    if (attachVideo) _controller = VideoController(_player);
  }

  /// libass renders the library's ASS tracks with their own styling,
  /// positioning and karaoke timing. Without this media_kit falls back to
  /// drawing plain Flutter text — mpv is even started with
  /// `sub-visibility: no` — which loses all of that.
  ///
  /// On Android fontconfig cannot see the system fonts, so libass needs a real
  /// font file bundled as an asset or it renders nothing at all.
  static const _libassConfig = PlayerConfiguration(
    libass: true,
    libassAndroidFont: 'assets/fonts/subfont.ttf',
    libassAndroidFontName: 'DejaVu Sans',
  );

  late final Player _player;
  late final VideoController _controller;

  @override
  Future<void> open(Uri uri, Map<String, String> headers) =>
      _player.open(Media(uri.toString(), httpHeaders: headers));

  @override
  Stream<List<SubtitleTrackInfo>> get subtitleTracks =>
      _player.stream.tracks.map(subtitleInfosFrom);

  @override
  Future<void> setSubtitleTrack(SubtitleTrackInfo? track) =>
      _player.setSubtitleTrack(
        track == null
            ? SubtitleTrack.no()
            : SubtitleTrack(track.id, track.title, track.language),
      );

  @override
  Stream<Duration> get position => _player.stream.position;

  @override
  Stream<Duration> get duration => _player.stream.duration;

  @override
  Stream<bool> get playing => _player.stream.playing;

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration to) => _player.seek(to);

  @override
  Widget buildSurface() => Video(
        controller: _controller,
        // libass draws the subtitles into the video frame itself, so
        // media_kit's Flutter subtitle widget would render them a second time
        // — unstyled, and stranded in the letterbox below the picture.
        subtitleViewConfiguration: const SubtitleViewConfiguration(
          visible: false,
        ),
      );

  @override
  Future<void> dispose() => _player.dispose();
}

/// The real, user-selectable subtitle tracks in [tracks].
///
/// A named function rather than an inline closure so it can be exercised
/// directly: the underlying mpv stream only emits when the track list
/// *changes*, which never happens for a file that fails to load.
List<SubtitleTrackInfo> subtitleInfosFrom(Tracks tracks) => tracks.subtitle
    .where((t) => !isPlaceholderTrack(t))
    .map(toTrackInfo)
    .toList();

/// Flattens a media_kit [SubtitleTrack] into the plugin-free
/// [SubtitleTrackInfo].
///
/// mpv's synthetic `no`/`auto` entries are kept out by the caller; `forced` is
/// inferred from the title because media_kit does not expose the flag (see
/// [looksForcedTitle]).
SubtitleTrackInfo toTrackInfo(SubtitleTrack track) => SubtitleTrackInfo(
      id: track.id,
      language: track.language ?? '',
      title: track.title ?? '',
      isDefault: track.isDefault ?? false,
      isForced: looksForcedTitle(track.title ?? ''),
    );

/// Whether [track] is one of mpv's synthetic placeholder entries rather than a
/// real embedded track. The picker renders its own "Off" entry instead.
bool isPlaceholderTrack(SubtitleTrack track) =>
    track.id == 'no' || track.id == 'auto';
