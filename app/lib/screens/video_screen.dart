import 'dart:async';

import 'package:dufs_client/services/app_player.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/ui/theme.dart';
import 'package:dufs_client/util/subtitle_track.dart';
import 'package:flutter/material.dart';

/// Full-screen video player streaming over authenticated HTTP (with seeking
/// via HTTP Range).
///
/// Backed by media_kit (libmpv) rather than the platform player so that the
/// library's embedded ASS subtitle tracks render with their original styling
/// and can be switched at runtime.
class VideoScreen extends StatefulWidget {
  /// Creates a player for [path] using [client].
  const VideoScreen({
    required this.client,
    required this.path,
    required this.title,
    this.playerFactory,
    super.key,
  });

  /// The dufs client (supplies the URL and auth headers).
  final DufsClient client;

  /// Absolute cloud path of the video.
  final String path;

  /// Title shown in the app bar.
  final String title;

  /// Overrides how the player is built (tests inject a fake).
  final AppPlayerFactory? playerFactory;

  @override
  State<VideoScreen> createState() => _VideoScreenState();
}

class _VideoScreenState extends State<VideoScreen> {
  AppPlayer? _player;
  StreamSubscription<List<SubtitleTrackInfo>>? _tracksSub;
  List<SubtitleTrackInfo> _tracks = const [];
  SubtitleTrackInfo? _selected;
  String? _error;

  /// Whether the automatic track choice has already been applied. Matroska
  /// tracks arrive after playback starts and the stream fires repeatedly, so
  /// without this the player would keep overriding a manual selection.
  bool _autoSelected = false;

  @override
  void initState() {
    super.initState();
    unawaited(_init());
  }

  Future<void> _init() async {
    final player = (widget.playerFactory ?? MediaKitPlayer.new)();
    try {
      _tracksSub = player.subtitleTracks.listen(_onTracks);
      await player.open(
        widget.client.fileUri(widget.path),
        widget.client.authHeaders,
      );
      if (!mounted) {
        await player.dispose();
        return;
      }
      setState(() => _player = player);
    } on Exception catch (e) {
      await player.dispose();
      if (mounted) setState(() => _error = '$e');
    }
  }

  void _onTracks(List<SubtitleTrackInfo> tracks) {
    if (!mounted) return;
    setState(() => _tracks = tracks);
    if (_autoSelected || tracks.isEmpty) return;
    final pick = pickDefaultSubtitle(tracks);
    // Latch only once something was actually chosen. Matroska tracks arrive
    // progressively, so an early emission can hold nothing worth selecting
    // (e.g. only the forced signs/songs track) while the English default is
    // still to come — burning the latch there would leave subtitles off for
    // the whole file.
    if (pick == null) return;
    _autoSelected = true;
    unawaited(_select(pick));
  }

  Future<void> _select(SubtitleTrackInfo? track) async {
    final player = _player;
    setState(() => _selected = track);
    if (player != null) await player.setSubtitleTrack(track);
  }

  @override
  void dispose() {
    unawaited(_tracksSub?.cancel());
    unawaited(_player?.dispose());
    super.dispose();
  }

  /// Menu value meaning "no subtitles".
  ///
  /// The menu is keyed by track id rather than by [SubtitleTrackInfo?] because
  /// `PopupMenuButton` reports a null selection as a *dismissal*
  /// (`onCanceled`), so an "Off" entry carrying a null value could never fire.
  static const _offValue = '';

  /// The track carrying [id], or null for [_offValue] — and for an id that is
  /// no longer in the list, which turns subtitles off rather than silently
  /// swapping in an unrelated language.
  SubtitleTrackInfo? _trackById(String id) {
    for (final track in _tracks) {
      if (track.id == id) return track;
    }
    return null;
  }

  /// Subtitle picker; hidden until the demuxer reports at least one track.
  Widget? _subtitleButton() {
    if (_tracks.isEmpty) return null;
    return PopupMenuButton<String>(
      icon: Icon(
        _selected == null ? Icons.subtitles_off_outlined : Icons.subtitles,
      ),
      tooltip: 'Subtitles',
      onSelected: (id) => unawaited(_select(_trackById(id))),
      itemBuilder: (context) => [
        CheckedPopupMenuItem<String>(
          value: _offValue,
          checked: _selected == null,
          child: const Text('Off'),
        ),
        for (final track in _tracks)
          CheckedPopupMenuItem<String>(
            value: track.id,
            checked: _selected?.id == track.id,
            child: Text(subtitleLabel(track)),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final player = _player;
    final subtitles = _subtitleButton();
    // Always dark regardless of the app's own theme — see the matching
    // comment in image_screen.dart / AppViewerColors' doc comment.
    return Scaffold(
      backgroundColor: AppViewerColors.background,
      appBar: AppBar(
        backgroundColor: AppViewerColors.background,
        foregroundColor: AppViewerColors.foreground,
        title: Text(widget.title),
        actions: [?subtitles],
      ),
      body: Center(
        child: _error != null
            ? Text(
                'Could not play: $_error',
                style: const TextStyle(color: AppViewerColors.muted),
              )
            : player == null
                ? const CircularProgressIndicator()
                : player.buildSurface(),
      ),
    );
  }
}
