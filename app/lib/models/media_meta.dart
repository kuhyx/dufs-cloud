/// Extra per-file metadata from the server-side index
/// (`/.meta/index.json`, built by `scripts/build_media_index.sh`). All fields
/// are nullable: absent for files the indexer has not processed.
class MediaMeta {
  /// Creates a [MediaMeta].
  const MediaMeta({
    this.width,
    this.height,
    this.durationMs,
    this.createdMs,
    this.uploadedMs,
    this.proxyPath,
    this.appProxyPath,
  });

  /// Builds a [MediaMeta] from one index entry's JSON map (tolerant of missing
  /// or wrongly-typed fields, which become null).
  factory MediaMeta.fromJson(Map<String, Object?> json) => MediaMeta(
        width: _asInt(json['width']),
        height: _asInt(json['height']),
        durationMs: _asInt(json['durationMs']),
        createdMs: _asInt(json['createdMs']),
        uploadedMs: _asInt(json['uploadedMs']),
        proxyPath: _asString(json['proxyPath']),
        appProxyPath: _asString(json['appProxyPath']),
      );

  /// Pixel width (images and videos), or null.
  final int? width;

  /// Pixel height (images and videos), or null.
  final int? height;

  /// Video duration in milliseconds, or null for non-videos.
  final int? durationMs;

  /// Original creation time (EXIF/birth) in epoch ms, or null.
  final int? createdMs;

  /// When the indexer first saw the file (≈ upload time) in epoch ms, or null.
  final int? uploadedMs;

  /// Absolute cloud path of a browser-safe MP4 proxy for this video (see
  /// `scripts/generate_video_proxies.sh`), or null when either this isn't a
  /// video or the original already plays fine as-is.
  ///
  /// Only the web gallery uses it. This app streams the original through
  /// libmpv, which plays those containers natively and keeps the embedded
  /// subtitle tracks the proxy strips.
  final String? proxyPath;

  /// Absolute cloud path of a Matroska proxy built for *this app* (see
  /// `scripts/generate_video_proxies.sh`), or null when the original is fine.
  ///
  /// It exists only for audio the bundled libmpv cannot decode — TrueHD/MLP,
  /// which would otherwise play as silent video. Unlike [proxyPath] it keeps
  /// the embedded subtitle tracks, so preferring it costs nothing.
  final String? appProxyPath;
}

/// The metadata index: a map from absolute cloud path to its [MediaMeta].
typedef MetaIndex = Map<String, MediaMeta>;

/// Parses the decoded `/.meta/index.json` JSON into a [MetaIndex], tolerating
/// any malformed shape by yielding an empty map (the index is an optional
/// enrichment, never a hard dependency of the listing).
MetaIndex metaIndexFromJson(Object? decoded) {
  final out = <String, MediaMeta>{};
  if (decoded is! Map) return out;
  final entries = decoded['entries'];
  if (entries is! Map) return out;
  entries.forEach((key, value) {
    if (key is String && value is Map) {
      out[key] = MediaMeta.fromJson(value.cast<String, Object?>());
    }
  });
  return out;
}

int? _asInt(Object? v) => v is num ? v.toInt() : null;

String? _asString(Object? v) => v is String ? v : null;
