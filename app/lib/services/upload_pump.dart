import 'dart:async';

import 'package:dufs_client/models/transfer_progress.dart';

/// Feeds [data] into [sink] with backpressure: addStream pauses the source
/// whenever the socket is full, so at most a socket buffer's worth of the
/// file is ever in memory (plain sink.add would buffer without bound).
/// A cancel ends the counted stream early rather than throwing inside it,
/// because addStream forwards stream errors to the sink instead of raising
/// them here; the flag is checked afterwards and rethrown as the typed
/// exception the UI distinguishes from a failure.
Future<void> pumpUpload(
  Stream<List<int>> data,
  StreamSink<List<int>> sink,
  void Function(int sent)? onProgress,
  List<TransferCancel> cancels,
) async {
  var cancelled = false;
  Stream<List<int>> counted() async* {
    var sent = 0;
    await for (final chunk in data) {
      if (cancels.any((c) => c.cancelled)) {
        cancelled = true;
        return;
      }
      sent += chunk.length;
      onProgress?.call(sent);
      yield chunk;
    }
  }

  await sink.addStream(counted());
  if (cancelled) sink.addError(TransferCancelled());
  // Not awaited: the close future only completes once the consumer has
  // drained the body, which never happens for an aborted request.
  unawaited(sink.close());
  if (cancelled) throw TransferCancelled();
}
