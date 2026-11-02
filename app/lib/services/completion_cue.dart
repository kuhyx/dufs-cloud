import 'package:flutter/services.dart';

const MethodChannel _channel = MethodChannel('com.kuhy.dufs_client/completion');
const Duration _defaultMinElapsed = Duration(seconds: 2);

Future<void> _playPlatformCue() async {
  try {
    await _channel.invokeMethod<void>('playCompletionCue');
  } on MissingPluginException {
    return;
  } on PlatformException {
    return;
  }
}

/// Cues a successful, long-enough operation when the sound is enabled.
class CompletionCue {
  /// Creates a cue; [play] and [now] default to the platform sound and clock.
  CompletionCue({
    required bool Function() enabled,
    Future<void> Function()? play,
    DateTime Function()? now,
    Duration minElapsed = _defaultMinElapsed,
  }) : _isOn = enabled,
       _play = play ?? _playPlatformCue,
       _now = now ?? DateTime.now,
       _threshold = minElapsed;

  final bool Function() _isOn;
  final Future<void> Function() _play;
  final DateTime Function() _now;
  final Duration _threshold;

  /// Starts timing; cancel and error paths stay silent by never finishing.
  CueRun begin() => CueRun._(this, _now());
}

/// One timed operation of a [CompletionCue].
class CueRun {
  CueRun._(this._cue, this._start);

  final CompletionCue _cue;
  final DateTime _start;
  bool _done = false;

  /// Plays the cue once if enabled and the run took long enough.
  Future<void> succeeded() async {
    if (_done) return;
    _done = true;
    final elapsed = _cue._now().difference(_start);
    if (elapsed < _cue._threshold || !_cue._isOn()) return;
    try {
      await _cue._play();
    } on Exception {
      return;
    }
  }
}
