import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/services/dufs_client.dart';

/// Names never included in the whole-cloud index: the app shell, the
/// thumbnail/proxy mirrors (`.thumbs`/`.proxies` — descending them would
/// double the walk and flood results with a thumbnail/proxy per video), the
/// metadata index, and the KeePass data (sensitive and noise in a media
/// filter).
const Set<String> skipNames = {
  'index.html',
  'assets',
  'favicon.ico',
  'vite.svg',
  '.thumbs',
  '_thumbs',
  '.meta',
  '.proxies',
  'Keepass',
};

/// Live counters of an index walk: folders listed, entries found so far and
/// the folder listed last. All true counts, never estimates.
class IndexProgress {
  /// Creates a snapshot.
  const IndexProgress({
    required this.folders,
    required this.entries,
    required this.path,
  });

  /// The state before any folder has been listed.
  static const none = IndexProgress(folders: 0, entries: 0, path: '');

  /// Folders listed so far.
  final int folders;

  /// Entries (files and folders) found so far.
  final int entries;

  /// The folder listed most recently.
  final String path;
}

/// Recursively walks the whole cloud from the root, collecting every
/// non-skipped entry (files and folders). A single folder's failed PROPFIND is
/// skipped so one bad folder cannot abort the index. Used for scoped global
/// filtering: the caller filters the result to the current subtree.
///
/// [onProgress] reports the live counts after each folder. Cancelling [cancel]
/// stops the descent and returns what was found so far (a partial index).
Future<List<DirEntry>> buildCloudIndex(
  DufsClient client, {
  void Function(IndexProgress progress)? onProgress,
  TransferCancel? cancel,
}) async {
  final walk = _Walk(onProgress, cancel);
  await _walk(client, '/', walk);
  return walk.acc;
}

class _Walk {
  _Walk(this.onProgress, this.cancel);

  final void Function(IndexProgress progress)? onProgress;
  final TransferCancel? cancel;
  final List<DirEntry> acc = <DirEntry>[];
  int folders = 0;
  // Entries found: counted when their folder's listing arrives, so it only
  // grows and ends equal to `acc.length`.
  int found = 0;
  String last = '';

  bool get stopped => cancel?.cancelled ?? false;

  void report() => onProgress?.call(
    IndexProgress(folders: folders, entries: found, path: last),
  );
}

Future<void> _walk(DufsClient client, String dir, _Walk walk) async {
  if (walk.stopped) return;
  List<DirEntry> entries;
  try {
    entries = await client.list(dir);
  } on Exception {
    return;
  }
  walk
    ..folders += 1
    ..found += entries.where((e) => !skipNames.contains(e.name)).length
    ..last = dir
    ..report();
  for (final entry in entries) {
    if (skipNames.contains(entry.name)) continue;
    walk.acc.add(entry);
    if (entry.isDir) await _walk(client, entry.path, walk);
  }
}
