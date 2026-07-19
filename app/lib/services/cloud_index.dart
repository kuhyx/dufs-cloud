import 'package:dufs_client/models/dir_entry.dart';
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

/// Recursively walks the whole cloud from the root, collecting every
/// non-skipped entry (files and folders). A single folder's failed PROPFIND is
/// skipped so one bad folder cannot abort the index. Used for scoped global
/// filtering: the caller filters the result to the current subtree.
Future<List<DirEntry>> buildCloudIndex(DufsClient client) async {
  final acc = <DirEntry>[];
  await _walk(client, '/', acc);
  return acc;
}

Future<void> _walk(DufsClient client, String dir, List<DirEntry> acc) async {
  List<DirEntry> entries;
  try {
    entries = await client.list(dir);
  } on Exception {
    return;
  }
  for (final entry in entries) {
    if (skipNames.contains(entry.name)) continue;
    acc.add(entry);
    if (entry.isDir) await _walk(client, entry.path, acc);
  }
}
