import 'package:dufs_client/util/paths.dart' as paths;

/// Whether a cloud entry is a directory or a file.
enum EntryKind {
  /// A directory.
  dir,

  /// A file.
  file,
}

/// One entry from a dufs directory listing (a WebDAV PROPFIND response row).
class DirEntry {
  /// Creates a [DirEntry].
  const DirEntry({
    required this.name,
    required this.path,
    required this.kind,
    required this.size,
    this.mtimeMs = 0,
  });

  /// Base name, e.g. `pic.jpg`.
  final String name;

  /// Absolute path from the cloud root, e.g. `/Media/2026/07/pic.jpg`.
  final String path;

  /// Whether this entry is a directory or a file.
  final EntryKind kind;

  /// Size in bytes (0 for directories).
  final int size;

  /// Last-modified time in epoch milliseconds (0 if unknown).
  final int mtimeMs;

  /// Whether this is a directory.
  bool get isDir => kind == EntryKind.dir;

  /// Whether this file is a viewable image (by extension).
  bool get isImage => paths.isImage(name);

  /// Whether this file is a playable video (by extension).
  bool get isVideo => paths.isVideo(name);

  /// Whether this file is an editable text file (by extension).
  bool get isText => paths.isText(name);
}
