/// A file chosen for upload: its name, size, and a way to stream its bytes.
/// Wraps whatever the picker hands back so screens and tests never touch
/// platform types.
class UploadSource {
  /// Creates an upload source.
  const UploadSource({
    required this.name,
    required this.size,
    required this.open,
  });

  /// Base name, including extension.
  final String name;

  /// Size in bytes (the progress denominator).
  final int size;

  /// Opens a fresh byte stream over the file.
  final Stream<List<int>> Function() open;
}
