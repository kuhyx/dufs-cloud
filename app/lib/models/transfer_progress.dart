import 'package:dufs_client/util/paths.dart' as paths;

/// Direction of a byte transfer between the device and the cloud.
enum TransferKind {
  /// Device -> cloud (PUT).
  upload,

  /// Cloud -> device (GET).
  download,
}

/// A snapshot of one file's place in a multi-file transfer: which file
/// (1-based [index] of [total]), and how many of its [size] bytes are [done].
/// Sizes come from the picker (uploads) or the PROPFIND listing (downloads),
/// never from `Content-Length`, so progress is deterministic and testable.
class TransferProgress {
  /// Creates a snapshot.
  const TransferProgress({
    required this.kind,
    required this.index,
    required this.total,
    required this.name,
    required this.done,
    required this.size,
  });

  /// Upload or download.
  final TransferKind kind;

  /// 1-based position of the current file in the batch.
  final int index;

  /// Number of files in the batch.
  final int total;

  /// Base name of the current file.
  final String name;

  /// Bytes transferred so far for the current file.
  final int done;

  /// Total bytes of the current file.
  final int size;

  /// Completed fraction of the current file, or null when the size is
  /// unknown/zero (an indeterminate bar).
  double? get fraction => size <= 0 ? null : (done / size).clamp(0, 1);

  /// Copy with the byte counter advanced to [done].
  TransferProgress withDone(int done) => TransferProgress(
    kind: kind,
    index: index,
    total: total,
    name: name,
    done: done,
    size: size,
  );

  /// First banner line: `Uploading 3/7 · photo.jpg`.
  String get title {
    final verb = kind == TransferKind.upload ? 'Uploading' : 'Downloading';
    return '$verb $index/$total · $name';
  }

  /// Second banner line: `42 % · 12.3 MB / 29.1 MB` (just the byte count
  /// while the size is unknown).
  String get detail {
    final f = fraction;
    if (f == null) return paths.humanSize(done);
    return '${(f * 100).floor()} % · '
        '${paths.humanSize(done)} / ${paths.humanSize(size)}';
  }
}

/// Thrown by a transfer that was cancelled through [TransferCancel].
class TransferCancelled implements Exception {
  @override
  String toString() => 'Transfer cancelled';
}

/// A cooperative cancellation flag shared between the banner's Cancel button
/// and the streaming loops, which call [check] between chunks.
class TransferCancel {
  bool _cancelled = false;

  /// Whether [cancel] has been called.
  bool get cancelled => _cancelled;

  /// Requests cancellation; the next [check] throws.
  void cancel() => _cancelled = true;

  /// Throws [TransferCancelled] once [cancel] has been called.
  void check() {
    if (_cancelled) throw TransferCancelled();
  }
}
