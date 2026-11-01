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
  }) => FilterState(
    query: query ?? this.query,
    type: type ?? this.type,
    extIncludes: extIncludes ?? this.extIncludes,
    extExcludes: extExcludes ?? this.extExcludes,
    minSize: minSize == _keep ? this.minSize : minSize as int?,
    maxSize: maxSize == _keep ? this.maxSize : maxSize as int?,
    minDurationMs: minDurationMs == _keep
        ? this.minDurationMs
        : minDurationMs as int?,
    maxDurationMs: maxDurationMs == _keep
        ? this.maxDurationMs
        : maxDurationMs as int?,
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
