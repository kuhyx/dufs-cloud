import 'dart:async';

import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// Builds the [VideoPlayerController] for a given [uri]/[httpHeaders].
/// Injectable so tests can supply a controller backed by a fake platform.
typedef AudioControllerFactory = VideoPlayerController Function(
  Uri uri, {
  Map<String, String> httpHeaders,
});

/// Full-screen audio player streaming over authenticated HTTP. Reuses
/// [VideoPlayerController] (already a dependency, and audio-only network
/// sources play fine with it) instead of adding a dedicated audio-playback
/// package.
class AudioScreen extends StatefulWidget {
  /// Creates a player for [path] using [client].
  const AudioScreen({
    required this.client,
    required this.path,
    required this.title,
    this.controllerFactory,
    super.key,
  });

  /// The dufs client (supplies the URL and auth headers).
  final DufsClient client;

  /// Absolute cloud path of the audio file.
  final String path;

  /// Title shown in the app bar.
  final String title;

  /// Overrides how the player controller is built (tests inject a fake).
  final AudioControllerFactory? controllerFactory;

  @override
  State<AudioScreen> createState() => _AudioScreenState();
}

class _AudioScreenState extends State<AudioScreen> {
  VideoPlayerController? _audio;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_init());
  }

  Future<void> _init() async {
    final build =
        widget.controllerFactory ?? VideoPlayerController.networkUrl;
    final controller = build(
      widget.client.fileUri(widget.path),
      httpHeaders: widget.client.authHeaders,
    );
    try {
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      controller.addListener(_onTick);
      await controller.play();
      setState(() => _audio = controller);
    } on Exception catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  void _onTick() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    final audio = _audio;
    if (audio != null) {
      audio.removeListener(_onTick);
      unawaited(audio.dispose());
    }
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
                : _Controls(audio: audio, fmt: _fmt),
      ),
    );
  }
}

class _Controls extends StatelessWidget {
  const _Controls({required this.audio, required this.fmt});

  final VideoPlayerController audio;
  final String Function(Duration) fmt;

  @override
  Widget build(BuildContext context) {
    final value = audio.value;
    final durationMs = value.duration.inMilliseconds;
    final positionMs = value.position.inMilliseconds.clamp(
      0,
      durationMs == 0 ? 1 : durationMs,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.audiotrack, size: 96),
          const SizedBox(height: 24),
          Slider(
            value: positionMs.toDouble(),
            max: durationMs == 0 ? 1 : durationMs.toDouble(),
            onChanged: (v) => audio.seekTo(Duration(milliseconds: v.round())),
          ),
          Text('${fmt(value.position)} / ${fmt(value.duration)}'),
          const SizedBox(height: 8),
          IconButton(
            iconSize: 56,
            icon: Icon(
              value.isPlaying ? Icons.pause_circle : Icons.play_circle,
            ),
            onPressed: () =>
                value.isPlaying ? audio.pause() : audio.play(),
          ),
        ],
      ),
    );
  }
}
