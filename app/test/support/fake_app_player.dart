import 'dart:async';

import 'package:dufs_client/services/app_player.dart';
import 'package:dufs_client/util/subtitle_track.dart';
import 'package:flutter/widgets.dart';

/// In-memory [AppPlayer] so `VideoScreen` can be driven without libmpv.
///
/// Subtitle tracks are pushed manually via [emitTracks] because that is how
/// the real player behaves: Matroska tracks are demuxed after `open`, so they
/// arrive on the stream some time later rather than being known up front.
class FakeAppPlayer implements AppPlayer {
  /// Makes [open] throw, exercising the error path.
  bool failOpen = false;

  /// When set, [open] waits on this before completing.
  Completer<void>? openGate;

  /// Paths opened, in order.
  final List<Uri> opened = [];

  /// Headers passed to the most recent [open].
  Map<String, String>? headers;

  /// Every track selection made, including nulls ("off").
  final List<SubtitleTrackInfo?> selections = [];

  /// Whether [dispose] ran.
  bool disposed = false;

  /// Seeks requested, in order.
  final List<Duration> seeks = [];

  /// Whether [play] has been called more recently than [pause].
  bool resumed = false;

  final _tracks = StreamController<List<SubtitleTrackInfo>>.broadcast();
  final _position = StreamController<Duration>.broadcast();
  final _duration = StreamController<Duration>.broadcast();
  final _playing = StreamController<bool>.broadcast();

  /// Pushes [tracks] to listeners, as the demuxer would.
  void emitTracks(List<SubtitleTrackInfo> tracks) => _tracks.add(tracks);

  /// Pushes a playback position.
  void emitPosition(Duration p) => _position.add(p);

  /// Pushes a total duration, as the demuxer would once it knows it.
  void emitDuration(Duration d) => _duration.add(d);

  /// Pushes a play/pause state change.
  void emitPlaying({required bool value}) => _playing.add(value);

  @override
  Future<void> open(Uri uri, Map<String, String> headers) async {
    if (openGate != null) await openGate!.future;
    if (failOpen) throw Exception('boom');
    opened.add(uri);
    this.headers = headers;
  }

  @override
  Stream<List<SubtitleTrackInfo>> get subtitleTracks => _tracks.stream;

  @override
  Future<void> setSubtitleTrack(SubtitleTrackInfo? track) async {
    selections.add(track);
  }

  @override
  Stream<Duration> get position => _position.stream;

  @override
  Stream<Duration> get duration => _duration.stream;

  @override
  Stream<bool> get playing => _playing.stream;

  @override
  Future<void> play() async => resumed = true;

  @override
  Future<void> pause() async => resumed = false;

  @override
  Future<void> seek(Duration to) async => seeks.add(to);

  @override
  Widget buildSurface() => const SizedBox(key: Key('fake-surface'));

  @override
  Future<void> dispose() async {
    disposed = true;
    await _tracks.close();
    await _position.close();
    await _duration.close();
    await _playing.close();
  }
}
