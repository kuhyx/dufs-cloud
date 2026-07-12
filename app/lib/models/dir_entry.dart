/// Whether a cloud entry is a directory or a file.
enum EntryKind {
  /// A directory.
  dir,

  /// A file.
  file,
}

const Set<String> _imageExts = {
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'heif', 'tiff', 'avif',
};
const Set<String> _videoExts = {
  'mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', '3gp', 'mpg', 'mpeg', 'wmv', 'flv',
};

/// One entry from a dufs directory listing (a WebDAV PROPFIND response row).
class DirEntry {
  /// Creates a [DirEntry].
  const DirEntry({
    required this.name,
    required this.path,
    required this.kind,
    required this.size,
  });

  /// Base name, e.g. `pic.jpg`.
  final String name;

  /// Absolute path from the cloud root, e.g. `/Media/2026/07/pic.jpg`.
  final String path;

  /// Whether this entry is a directory or a file.
  final EntryKind kind;

  /// Size in bytes (0 for directories).
  final int size;

  /// Whether this is a directory.
  bool get isDir => kind == EntryKind.dir;

  /// Whether this file is a viewable image (by extension).
  bool get isImage => _hasExt(_imageExts);

  /// Whether this file is a playable video (by extension).
  bool get isVideo => _hasExt(_videoExts);

  bool _hasExt(Set<String> exts) {
    final dot = name.lastIndexOf('.');
    if (dot < 0 || dot == name.length - 1) return false;
    return exts.contains(name.substring(dot + 1).toLowerCase());
  }
}
