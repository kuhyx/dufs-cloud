import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
import 'package:dufs_client/util/paths.dart' as paths;

/// Distinct file extensions across [entries], lower-cased and sorted. Powers
/// the extension picker so the user picks from what actually exists in scope.
List<String> availableExtensions(List<DirEntry> entries) {
  final set = <String>{};
  for (final entry in entries) {
    if (entry.kind != EntryKind.file) continue;
    final ext = paths.extname(entry.name);
    if (ext.isNotEmpty) set.add(ext);
  }
  return set.toList()..sort();
}

/// All file sizes in [entries], ascending. Feeds the quantile-scaled size
/// slider, which needs the full distribution. Directories are skipped.
List<int> sizeValues(List<DirEntry> entries) {
  final out = <int>[
    for (final e in entries)
      if (e.kind == EntryKind.file) e.size,
  ]..sort();
  return out;
}

/// All known video durations (ms) in [entries], ascending, read from [meta].
/// Feeds the quantile-scaled duration slider; empty when none are indexed.
List<int> durationValues(List<DirEntry> entries, MetaIndex meta) {
  final out = <int>[];
  for (final entry in entries) {
    final ms = meta[entry.path]?.durationMs;
    if (ms != null) out.add(ms);
  }
  return out..sort();
}

/// A group of entries that share a containing folder.
class FolderGroup {
  /// Creates a [FolderGroup].
  const FolderGroup(this.folder, this.entries);

  /// Absolute folder path the entries live in, e.g. `/Media/2026`.
  final String folder;

  /// The entries in that folder.
  final List<DirEntry> entries;
}

/// Groups [entries] by containing folder, folders sorted by path. Renders
/// global (whole-cloud) filter results under per-folder headers. Preserves the
/// incoming order within each group (callers pass an already-sorted list).
List<FolderGroup> groupByFolder(List<DirEntry> entries) {
  final map = <String, List<DirEntry>>{};
  for (final entry in entries) {
    (map[paths.parentPath(entry.path)] ??= <DirEntry>[]).add(entry);
  }
  final folders = map.keys.toList()..sort();
  return [for (final folder in folders) FolderGroup(folder, map[folder]!)];
}
