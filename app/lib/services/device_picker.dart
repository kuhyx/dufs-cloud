
import 'package:dufs_client/models/upload_source.dart';
import 'package:flutter/services.dart';

/// Picks files to upload through the Storage Access Framework picker in
/// `MainActivity.kt` and streams their bytes back chunk by chunk. Pull-based
/// reads over the channel give natural backpressure and never copy the file
/// anywhere first. The channel is injectable for tests.
class DevicePicker {
  /// Creates the picker over [channel] (defaults to the app's channel) and
  /// reads [chunkSize] bytes per round trip.
  DevicePicker({MethodChannel? channel, this.chunkSize = defaultChunkSize})
    : _channel = channel ?? const MethodChannel(channelName);

  /// Name of the platform channel implemented in `MainActivity.kt`.
  static const String channelName = 'com.kuhy.dufs_client/downloads';

  /// 256 KiB: large enough that a 1 GB file is ~4000 round trips, small
  /// enough that one chunk is a trivial amount of memory.
  static const int defaultChunkSize = 256 * 1024;

  final MethodChannel _channel;

  /// Bytes requested per `readChunk` call.
  final int chunkSize;

  /// Opens the system picker (multi-select, any type). Empty on cancel.
  Future<List<UploadSource>> pick() async {
    final raw = await _channel.invokeListMethod<Map<Object?, Object?>>(
      'pickFiles',
    );
    return [
      for (final item in raw ?? const <Map<Object?, Object?>>[])
        UploadSource(
          name: item['name']! as String,
          size: (item['size']! as num).toInt(),
          open: () => _read(item['uri']! as String),
        ),
    ];
  }

  Stream<List<int>> _read(String uri) async* {
    final handle = await _channel.invokeMethod<int>(
      'openRead',
      <String, String>{'uri': uri},
    );
    try {
      while (true) {
        final chunk = await _channel.invokeMethod<Uint8List>(
          'readChunk',
          <String, int>{'handle': handle!, 'size': chunkSize},
        );
        if (chunk == null || chunk.isEmpty) break;
        yield chunk;
      }
    } finally {
      await _channel.invokeMethod<bool>('closeRead', <String, int>{
        'handle': handle!,
      });
    }
  }
}
