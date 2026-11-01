import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
import 'package:dufs_client/util/filter_state.dart';
import 'package:dufs_client/util/paths.dart' as paths;

export 'package:dufs_client/util/filter_state.dart';

const List<TypeFilter> _categoryOrder = [
  TypeFilter.folder,
  TypeFilter.image,
  TypeFilter.video,
  TypeFilter.audio,
  TypeFilter.pdf,
  TypeFilter.text,
  TypeFilter.other,
  TypeFilter.all,
];

/// The coarse category of [entry].
TypeFilter categoryOf(DirEntry entry) {
  if (entry.isDir) return TypeFilter.folder;
  if (paths.isImage(entry.name)) return TypeFilter.image;
  if (paths.isVideo(entry.name)) return TypeFilter.video;
  if (paths.isAudio(entry.name)) return TypeFilter.audio;
  if (paths.isPdf(entry.name)) return TypeFilter.pdf;
  if (paths.isText(entry.name)) return TypeFilter.text;
  return TypeFilter.other;
}

/// Case-insensitive subsequence match: every [query] char appears in [target]
/// in order. Empty query matches everything.
bool fuzzyMatch(String query, String target) {
  if (query.isEmpty) return true;
  final q = query.toLowerCase();
  final t = target.toLowerCase();
  var i = 0;
  for (var j = 0; j < t.length && i < q.length; j++) {
    if (t[j] == q[i]) i++;
  }
  return i == q.length;
}

bool _passes(DirEntry entry, MetaIndex meta, FilterState f) {
  if (!fuzzyMatch(f.query, entry.name)) return false;
  if (f.type != TypeFilter.all && categoryOf(entry) != f.type) return false;
  // Folders are navigation aids: they skip the file-only filters below.
  if (entry.isDir) return true;
  final ext = paths.extname(entry.name);
  // Allowlist (if any) then denylist. Extensionless files ('') fail an
  // allowlist but pass a denylist — they count as "not <ext>".
  if (f.extIncludes.isNotEmpty && !f.extIncludes.contains(ext)) return false;
  if (f.extExcludes.contains(ext)) return false;
  if (f.minSize != null && entry.size < f.minSize!) return false;
  if (f.maxSize != null && entry.size > f.maxSize!) return false;
  final dur = meta[entry.path]?.durationMs;
  if (f.minDurationMs != null && (dur == null || dur < f.minDurationMs!)) {
    return false;
  }
  if (f.maxDurationMs != null && (dur == null || dur > f.maxDurationMs!)) {
    return false;
  }
  final px = _pixels(entry, meta);
  if (f.minPixels != null && (px == null || px < f.minPixels!)) return false;
  if (f.maxPixels != null && (px == null || px > f.maxPixels!)) return false;
  return true;
}

/// Total pixels (width × height) for [entry], or null when either dimension is
/// unknown.
int? _pixels(DirEntry entry, MetaIndex meta) {
  final m = meta[entry.path];
  final w = m?.width;
  final h = m?.height;
  if (w == null || h == null) return null;
  return w * h;
}

int _compare(DirEntry a, DirEntry b, MetaIndex meta, SortState sort) {
  // Directories always cluster first, regardless of sort direction.
  if (a.isDir != b.isDir) return a.isDir ? -1 : 1;
  var c = 0;
  switch (sort.key) {
    case SortKey.name:
      c = a.name.toLowerCase().compareTo(b.name.toLowerCase());
    case SortKey.extension:
      c = paths.extname(a.name).compareTo(paths.extname(b.name));
    case SortKey.type:
      c = _categoryOrder
          .indexOf(categoryOf(a))
          .compareTo(_categoryOrder.indexOf(categoryOf(b)));
    case SortKey.size:
      c = a.size.compareTo(b.size);
    case SortKey.modified:
      c = a.mtimeMs.compareTo(b.mtimeMs);
    case SortKey.created:
      c = (meta[a.path]?.createdMs ?? 0).compareTo(
        meta[b.path]?.createdMs ?? 0,
      );
    case SortKey.uploaded:
      c = (meta[a.path]?.uploadedMs ?? 0).compareTo(
        meta[b.path]?.uploadedMs ?? 0,
      );
    case SortKey.duration:
      c = (meta[a.path]?.durationMs ?? 0).compareTo(
        meta[b.path]?.durationMs ?? 0,
      );
    case SortKey.resolution:
      c = (_pixels(a, meta) ?? 0).compareTo(_pixels(b, meta) ?? 0);
  }
  if (c == 0) c = a.name.toLowerCase().compareTo(b.name.toLowerCase());
  return sort.dir == SortDir.asc ? c : -c;
}

/// Filters then sorts [entries] using [meta] for index-only fields. Pure.
List<DirEntry> applyFilterSort(
  List<DirEntry> entries,
  MetaIndex meta,
  FilterState filter,
  SortState sort,
) {
  final out = entries.where((e) => _passes(e, meta, filter)).toList()
    ..sort((a, b) => _compare(a, b, meta, sort));
  return out;
}
