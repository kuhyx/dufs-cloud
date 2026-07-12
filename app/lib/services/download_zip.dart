import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/services/dufs_client.dart';

/// The archive path of [full] relative to directory [base].
String _relativeTo(String base, String full) {
  final prefix = base == '/' ? '/' : '$base/';
  return full.substring(prefix.length);
}

/// Recursively collects every file under [entry]: the file itself when it is a
/// file, or all descendant files when it is a directory.
Future<List<DirEntry>> gatherFiles(DufsClient client, DirEntry entry) async {
  if (entry.kind == EntryKind.file) return [entry];
  final out = <DirEntry>[];
  for (final child in await client.list(entry.path)) {
    out.addAll(await gatherFiles(client, child));
  }
  return out;
}

/// Builds a STORE-method (no-compression) zip of [entries] (files and/or
/// folders) rooted at directory [base]. Archive paths stay relative to [base],
/// so a selected folder is reproduced as a nested tree. Folders are zipped
/// on-device because dufs's server `?zip` 404s for subfolders under render-spa
/// (the production config). Media is already compressed, so STORE adds no size.
Future<Uint8List> buildSelectionZip(
  DufsClient client,
  String base,
  List<DirEntry> entries,
) async {
  final archive = Archive();
  for (final entry in entries) {
    for (final file in await gatherFiles(client, entry)) {
      final bytes = await client.download(file.path);
      archive.addFile(ArchiveFile.bytes(_relativeTo(base, file.path), bytes));
    }
  }
  // STORE (no compression): cloud media is already compressed.
  return ZipEncoder().encodeBytes(archive, level: DeflateLevel.none);
}
