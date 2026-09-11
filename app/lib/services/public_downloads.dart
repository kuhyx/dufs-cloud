import 'package:flutter/services.dart';

/// A file that landed in the device's public Download/ folder.
class SavedFile {
  /// Creates a record of a saved file.
  const SavedFile({
    required this.uri,
    required this.name,
    required this.relativePath,
    required this.mime,
  });

  /// The MediaStore content URI (what an ACTION_VIEW intent opens).
  final String uri;

  /// The display name as actually saved — MediaStore renames on collision
  /// (`x (1).bin`), so this can differ from the requested name.
  final String name;

  /// Folder relative to external storage, with a trailing slash
  /// (`Download/`).
  final String relativePath;

  /// MIME type derived from the extension on the platform side.
  final String mime;

  /// The user-facing location, e.g. `Download/x (1).bin`.
  String get location => '$relativePath$name';
}

/// Moves finished downloads into the public Download/ collection and opens
/// them, through the `com.kuhy.dufs_client/downloads` platform channel
/// (see `MainActivity.kt`). The channel is injectable for tests.
class PublicDownloads {
  /// Creates the service over [channel] (defaults to the app's channel).
  PublicDownloads({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel(channelName);

  /// Name of the platform channel implemented in `MainActivity.kt`.
  static const String channelName = 'com.kuhy.dufs_client/downloads';

  final MethodChannel _channel;

  /// Moves the file at [tempPath] into Download/ as [name] (the platform
  /// deletes the temp file) and returns where it actually landed.
  Future<SavedFile> save(String tempPath, String name) async {
    final raw = await _channel.invokeMapMethod<String, String>(
      'saveToDownloads',
      <String, String>{'tempPath': tempPath, 'name': name},
    );
    if (raw == null) {
      throw PlatformException(code: 'save', message: 'no result');
    }
    return SavedFile(
      uri: raw['uri']!,
      name: raw['name']!,
      relativePath: raw['relativePath']!,
      mime: raw['mime']!,
    );
  }

  /// Opens [file] with the system viewer; false when no app can handle it.
  Future<bool> open(SavedFile file) async {
    final ok = await _channel.invokeMethod<bool>('openUri', <String, String>{
      'uri': file.uri,
      'mime': file.mime,
    });
    return ok ?? false;
  }
}
