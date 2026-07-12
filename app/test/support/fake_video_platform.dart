import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

/// A minimal in-test [VideoPlayerPlatform] so the player can be widget-tested
/// without a device. Emits an `initialized` event so `initialize()` completes;
/// set [failCreate] to exercise the error path.
class FakeVideoPlayerPlatform extends VideoPlayerPlatform
    with MockPlatformInterfaceMixin {
  /// When true, creating a player throws (drives the "Could not play" path).
  bool failCreate = false;

  /// If set, create() awaits this before returning — lets a test unmount the
  /// widget mid-initialization to exercise the "no longer mounted" branch.
  Completer<void>? createGate;

  final Map<int, StreamController<VideoEvent>> _events = {};
  int _next = 1;

  @override
  Future<void> init() async {}

  @override
  Future<int?> create(DataSource dataSource) => _make();

  @override
  Future<int?> createWithOptions(VideoCreationOptions options) => _make();

  Future<int?> _make() async {
    if (failCreate) throw Exception('create failed');
    if (createGate != null) await createGate!.future;
    final id = _next++;
    // Single-subscription controller so the buffered `initialized` event is
    // delivered when the player subscribes (a broadcast stream would drop it).
    final controller = StreamController<VideoEvent>();
    _events[id] = controller;
    controller.add(
      VideoEvent(
        eventType: VideoEventType.initialized,
        duration: const Duration(seconds: 10),
        size: const Size(320, 240),
        rotationCorrection: 0,
      ),
    );
    return id;
  }

  @override
  Stream<VideoEvent> videoEventsFor(int playerId) => _events[playerId]!.stream;

  @override
  Future<void> dispose(int playerId) async {
    await _events[playerId]?.close();
    _events.remove(playerId);
  }

  @override
  Future<void> setLooping(int playerId, bool looping) async {}

  @override
  Future<void> play(int playerId) async {}

  @override
  Future<void> pause(int playerId) async {}

  @override
  Future<void> setVolume(int playerId, double volume) async {}

  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}

  @override
  Future<void> seekTo(int playerId, Duration position) async {}

  @override
  Future<Duration> getPosition(int playerId) async => Duration.zero;

  @override
  Future<void> setMixWithOthers(bool mixWithOthers) async {}

  @override
  Widget buildView(int playerId) => const SizedBox.shrink();

  @override
  Widget buildViewWithOptions(VideoViewOptions options) =>
      const SizedBox.shrink();
}
