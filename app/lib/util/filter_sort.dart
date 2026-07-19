import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
import 'package:dufs_client/util/paths.dart' as paths;

/// Coarse category used by the type filter and the "type" sort.
enum TypeFilter {
  /// Any type.
  all,

  /// Directories only.
  folder,

  /// Image files.
  image,

  /// Video files.
  video,

  /// Audio files.
  audio,

  /// PDF files.
  pdf,

  /// Text files.
  text,

  /// Everything else.
  other,
}

/// Sort keys the UI exposes. `created`/`uploaded`/`duration` need the index.
enum SortKey {
  /// By base name.
  name,

  /// By byte size.
  size,

  /// By last-modified time.
  modified,

  /// By original creation time (from the index).
  created,

  /// By first-seen/upload time (from the index).
  uploaded,

  /// By video duration (from the index).
  duration,

  /// By total resolution, width × height (from the index).
  resolution,

  /// By coarse category.
  type,

  /// By file extension.
  extension,
}

/// Sort direction.
enum SortDir {
  /// Ascending.
  asc,

  /// Descending.
  desc,
}

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

const Object _keep = Object();

/// The complete filter state (name query, type, extensions, size/duration
/// bounds). Immutable; edit via [copyWith].
class FilterState {
  /// Creates a [FilterState]; every field defaults to "no filter".
  const FilterState({
    this.query = '',
    this.type = TypeFilter.all,
    this.extIncludes = const [],
    this.extExcludes = const [],
    this.minSize,
    this.maxSize,
    this.minDurationMs,
    this.maxDurationMs,
    this.minPixels,
    this.maxPixels,
  });

  /// Fuzzy (subsequence) filename query; empty matches everything.
  final String query;

  /// Coarse category filter.
  final TypeFilter type;

  /// Extensions (no dot) to keep — an allowlist; empty means "any".
  final List<String> extIncludes;

  /// Extensions (no dot) to drop — a denylist, applied after the allowlist.
  final List<String> extExcludes;

  /// Minimum file size in bytes, or null.
  final int? minSize;

  /// Maximum file size in bytes, or null.
  final int? maxSize;

  /// Minimum video duration in ms, or null.
  final int? minDurationMs;

  /// Maximum video duration in ms, or null.
  final int? maxDurationMs;

  /// Minimum resolution in total pixels (width × height), or null.
  final int? minPixels;

  /// Maximum resolution in total pixels (width × height), or null.
  final int? maxPixels;

  /// Returns a copy with the given fields replaced. Pass `null` explicitly to
  /// clear a nullable numeric bound; omit it to keep the current value.
  FilterState copyWith({
    String? query,
    TypeFilter? type,
    List<String>? extIncludes,
    List<String>? extExcludes,
    Object? minSize = _keep,
    Object? maxSize = _keep,
    Object? minDurationMs = _keep,
    Object? maxDurationMs = _keep,
    Object? minPixels = _keep,
    Object? maxPixels = _keep,
  }) =>
      FilterState(
        query: query ?? this.query,
        type: type ?? this.type,
        extIncludes: extIncludes ?? this.extIncludes,
        extExcludes: extExcludes ?? this.extExcludes,
        minSize: minSize == _keep ? this.minSize : minSize as int?,
        maxSize: maxSize == _keep ? this.maxSize : maxSize as int?,
        minDurationMs:
            minDurationMs == _keep ? this.minDurationMs : minDurationMs as int?,
        maxDurationMs:
            maxDurationMs == _keep ? this.maxDurationMs : maxDurationMs as int?,
        minPixels: minPixels == _keep ? this.minPixels : minPixels as int?,
        maxPixels: maxPixels == _keep ? this.maxPixels : maxPixels as int?,
      );
}

/// The default (inactive) filter.
const FilterState defaultFilter = FilterState();

/// A sort key and direction.
class SortState {
  /// Creates a [SortState].
  const SortState({this.key = SortKey.name, this.dir = SortDir.asc});

  /// The active sort key.
  final SortKey key;

  /// The active sort direction.
  final SortDir dir;

  /// Returns a copy with the given fields replaced.
  SortState copyWith({SortKey? key, SortDir? dir}) =>
      SortState(key: key ?? this.key, dir: dir ?? this.dir);
}

/// The default sort (name, ascending).
const SortState defaultSort = SortState();

/// True when [f] differs from the default (used to decide global search mode).
bool isFilterActive(FilterState f) =>
    f.query.isNotEmpty ||
    f.type != TypeFilter.all ||
    f.extIncludes.isNotEmpty ||
    f.extExcludes.isNotEmpty ||
    f.minSize != null ||
    f.maxSize != null ||
    f.minDurationMs != null ||
    f.maxDurationMs != null ||
    f.minPixels != null ||
    f.maxPixels != null;

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
      c = (meta[a.path]?.createdMs ?? 0)
          .compareTo(meta[b.path]?.createdMs ?? 0);
    case SortKey.uploaded:
      c = (meta[a.path]?.uploadedMs ?? 0)
          .compareTo(meta[b.path]?.uploadedMs ?? 0);
    case SortKey.duration:
      c = (meta[a.path]?.durationMs ?? 0)
          .compareTo(meta[b.path]?.durationMs ?? 0);
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
