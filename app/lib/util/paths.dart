/// Path and file-type helpers for cloud paths (absolute, from the cloud root).
///
/// Ported from the web app's `src/lib/paths.ts` so both clients classify files
/// and format sizes/durations identically.
library;

const Set<String> _imageExts = {
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', //
  'heic', 'heif', 'avif', 'svg',
};
const Set<String> _videoExts = {
  'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', //
  '3gp', 'ogv', 'mpg', 'mpeg', 'mts', 'm2ts', 'vob',
};
const Set<String> _textExts = {
  'txt', 'md', 'markdown', 'log', 'csv', 'json', 'yaml', 'yml', //
  'ini', 'conf', 'sh', 'toml', 'xml', 'py', 'js', 'html', 'css', 'tex',
  'ipynb',
};
const Set<String> _pdfExts = {'pdf'};
const Set<String> _audioExts = {
  'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'wma', 'opus',
};

/// Lower-case extension without the dot, or `''` if none.
String extname(String name) {
  final dot = name.lastIndexOf('.');
  if (dot <= 0 || dot == name.length - 1) return '';
  return name.substring(dot + 1).toLowerCase();
}

/// Whether [name] is a viewable image (by extension).
bool isImage(String name) => _imageExts.contains(extname(name));

/// Whether [name] is a playable video (by extension).
bool isVideo(String name) => _videoExts.contains(extname(name));

/// Whether [name] is an editable text file (by extension).
bool isText(String name) => _textExts.contains(extname(name));

/// Whether [name] is a viewable PDF (by extension).
bool isPdf(String name) => _pdfExts.contains(extname(name));

/// Whether [name] is a playable audio file (by extension).
bool isAudio(String name) => _audioExts.contains(extname(name));

/// Normalizes to a leading-slash, no-trailing-slash absolute path
/// (`'/'` stays `'/'`), resolving `.` and `..` segments.
String normalize(String path) {
  final out = <String>[];
  for (final part in path.split('/')) {
    if (part.isEmpty || part == '.') continue;
    if (part == '..') {
      if (out.isNotEmpty) out.removeLast();
    } else {
      out.add(part);
    }
  }
  return '/${out.join('/')}';
}

/// Joins [base] and [name] into a normalized absolute path.
String joinPath(String base, String name) => normalize('$base/$name');

/// The parent directory of [path] (`'/'` for the root).
String parentPath(String path) {
  final n = normalize(path);
  if (n == '/') return '/';
  final cut = n.substring(0, n.lastIndexOf('/'));
  return normalize(cut.isEmpty ? '/' : cut);
}

/// The base name of [path] (`'/'` for the root).
String basename(String path) {
  final n = normalize(path);
  if (n == '/') return '/';
  return n.substring(n.lastIndexOf('/') + 1);
}

/// True when [path] is [base] itself or lives anywhere beneath it. Root (`'/'`)
/// contains everything. Matches on a `'/'`-terminated prefix so `/Media/07` does
/// NOT swallow `/Media/0700`.
bool underPath(String path, String base) {
  if (base == '/') return true;
  return path == base || path.startsWith('$base/');
}

/// The subset of [pathList] that may legally be dropped into [destDir].
///
/// Drops the two cases the server cannot sensibly answer: a folder dragged
/// onto itself or into its own descendant (which would orphan the subtree),
/// and an item already living directly in [destDir] (a no-op move).
List<String> movableInto(Iterable<String> pathList, String destDir) {
  final dest = normalize(destDir);
  return pathList
      .where((p) => !underPath(dest, p) && parentPath(p) != dest)
      .toList();
}

/// One breadcrumb segment: a display [name] and the absolute [path] it links
/// to.
class Crumb {
  /// Creates a breadcrumb segment.
  const Crumb(this.name, this.path);

  /// Display label for the segment (`'cloud'` for the root).
  final String name;

  /// Absolute path the segment navigates to.
  final String path;
}

/// Breadcrumb segments for [path], root first.
List<Crumb> crumbs(String path) {
  final out = <Crumb>[const Crumb('cloud', '/')];
  final n = normalize(path);
  if (n == '/') return out;
  final acc = StringBuffer();
  for (final seg in n.split('/').where((p) => p.isNotEmpty)) {
    acc.write('/$seg');
    out.add(Crumb(seg, acc.toString()));
  }
  return out;
}

/// Human-readable byte size, e.g. `1536` -> `1.5 KB`.
String humanSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  var v = bytes / 1024;
  var unit = 'KB';
  for (final next in ['MB', 'GB', 'TB']) {
    if (v < 1024) break;
    v /= 1024;
    unit = next;
  }
  return '${v.toStringAsFixed(v < 10 ? 1 : 0)} $unit';
}

/// Human-readable duration, split into h/m/s (e.g. `5073000` ms ->
/// `1h 24m 33s`). Trailing zero units are dropped; `0s` for a zero (or
/// sub-second) duration.
String formatDuration(int ms) {
  final total = (ms / 1000).round();
  final h = total ~/ 3600;
  final m = (total % 3600) ~/ 60;
  final s = total % 60;
  final parts = <String>[];
  if (h > 0) parts.add('${h}h');
  if (m > 0) parts.add('${m}m');
  if (s > 0 || parts.isEmpty) parts.add('${s}s');
  return parts.join(' ');
}
