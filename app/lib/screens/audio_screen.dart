import 'dart:async';

import 'package:dufs_client/services/app_player.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';

/// Full-screen audio player streaming over authenticated HTTP.
///
/// Shares [AppPlayer] with the video screen so the app ships one media stack
/// (libmpv) rather than two. No video output is attached — audio needs no
/// texture.
class AudioScreen extends StatefulWidget {
  /// Creates a player for [path] using [client].
  const AudioScreen({
    required this.client,
    required this.path,
    required this.title,
    this.playerFactory,
    super.key,
  });

  /// The dufs client (supplies the URL and auth headers).
  final DufsClient client;

  /// Absolute cloud path of the audio file.
  final String path;

  /// Title shown in the app bar.
  final String title;

  /// Overrides how the player is built (tests inject a fake).
  final AppPlayerFactory? playerFactory;

  @override
  State<AudioScreen> createState() => _AudioScreenState();
}

class _AudioScreenState extends State<AudioScreen> {
  AppPlayer? _audio;
  final List<StreamSubscription<void>> _subs = [];
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  bool _playing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_init());
  }

  Future<void> _init() async {
    final player =
        (widget.playerFactory ?? () => MediaKitPlayer(attachVideo: false))();
    try {
      _subs
        ..add(player.position.listen((p) => _set(() => _position = p)))
        ..add(player.duration.listen((d) => _set(() => _duration = d)))
        ..add(player.playing.listen((p) => _set(() => _playing = p)));
      await player.open(
        widget.client.fileUri(widget.path),
        widget.client.authHeaders,
      );
      if (!mounted) {
        await player.dispose();
        return;
      }
      setState(() => _audio = player);
    } on Exception catch (e) {
      await player.dispose();
      if (mounted) setState(() => _error = '$e');
    }
  }

  void _set(VoidCallback change) {
    if (mounted) setState(change);
  }

  @override
  void dispose() {
    for (final sub in _subs) {
      unawaited(sub.cancel());
    }
    unawaited(_audio?.dispose());
    super.dispose();
  }

  static String _fmt(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return h > 0 ? '$h:$m:$s' : '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final audio = _audio;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Center(
        child: _error != null
            ? Text('Could not play: $_error')
            : audio == null
                ? const CircularProgressIndicator()
                : _Controls(
                    position: _position,
                    duration: _duration,
                    playing: _playing,
                    fmt: _fmt,
                    onSeek: (to) => unawaited(audio.seek(to)),
                    onToggle: () =>
                        unawaited(_playing ? audio.pause() : audio.play()),
                  ),
      ),
    );
  }
}

class _Controls extends StatelessWidget {
  const _Controls({
    required this.position,
    required this.duration,
    required this.playing,
    required this.fmt,
    required this.onSeek,
    required this.onToggle,
  });

  final Duration position;
  final Duration duration;
  final bool playing;
  final String Function(Duration) fmt;
  final void Function(Duration) onSeek;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final durationMs = duration.inMilliseconds;
    // A zero-length max would assert in Slider, and the position can briefly
    // run past a duration the demuxer has not finished refining.
    final maxMs = durationMs == 0 ? 1 : durationMs;
    final positionMs = position.inMilliseconds.clamp(0, maxMs);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.audiotrack, size: 96),
          const SizedBox(height: 24),
          Slider(
            value: positionMs.toDouble(),
            max: maxMs.toDouble(),
            onChanged: (v) => onSeek(Duration(milliseconds: v.round())),
          ),
          Text('${fmt(position)} / ${fmt(duration)}'),
          const SizedBox(height: 8),
          IconButton(
            iconSize: 56,
            icon: Icon(playing ? Icons.pause_circle : Icons.play_circle),
            onPressed: onToggle,
          ),
        ],
      ),
    );
  }
}
