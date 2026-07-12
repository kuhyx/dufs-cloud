import 'dart:async';

import 'package:chewie/chewie.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// Builds the [VideoPlayerController] for a given [uri]/[httpHeaders].
/// Injectable so tests can supply a controller backed by a fake platform.
typedef VideoControllerFactory = VideoPlayerController Function(
  Uri uri, {
  Map<String, String> httpHeaders,
});

/// Full-screen video player streaming over authenticated HTTP (with seeking
/// via HTTP Range).
class VideoScreen extends StatefulWidget {
  /// Creates a player for [path] using [client].
  const VideoScreen({
    required this.client,
    required this.path,
    required this.title,
    this.controllerFactory,
    super.key,
  });

  /// The dufs client (supplies the URL and auth headers).
  final DufsClient client;

  /// Absolute cloud path of the video.
  final String path;

  /// Title shown in the app bar.
  final String title;

  /// Overrides how the player controller is built (tests inject a fake).
  final VideoControllerFactory? controllerFactory;

  @override
  State<VideoScreen> createState() => _VideoScreenState();
}

class _VideoScreenState extends State<VideoScreen> {
  VideoPlayerController? _video;
  ChewieController? _chewie;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_init());
  }

  Future<void> _init() async {
    final build = widget.controllerFactory ?? VideoPlayerController.networkUrl;
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
      setState(() {
        _video = controller;
        _chewie = ChewieController(
          videoPlayerController: controller,
          autoPlay: true,
        );
      });
    } on Exception catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  void dispose() {
    final video = _video;
    _chewie?.dispose();
    if (video != null) unawaited(video.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chewie = _chewie;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.title),
      ),
      body: Center(
        child: _error != null
            ? Text(
                'Could not play: $_error',
                style: const TextStyle(color: Colors.white70),
              )
            : chewie == null
                ? const CircularProgressIndicator()
                : Chewie(controller: chewie),
      ),
    );
  }
}
