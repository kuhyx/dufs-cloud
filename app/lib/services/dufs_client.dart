import 'dart:async';
import 'dart:convert';

import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/services/propfind.dart';
import 'package:dufs_client/services/upload_pump.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:http/http.dart' as http;

export 'package:dufs_client/services/propfind.dart';

/// Client for the dufs server over HTTP + WebDAV, adding HTTP Basic auth to
/// every request (the mobile app supplies credentials explicitly, unlike the
/// same-origin web UI where the browser handles auth).
class DufsClient {
  /// Creates a client for [baseUrl] with the given credentials. A custom
  /// [httpClient] can be injected for testing.
  DufsClient({
    required this.baseUrl,
    required this.username,
    required this.password,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  /// Base URL, e.g. `https://host` (a trailing slash is tolerated).
  final String baseUrl;

  /// dufs web username.
  final String username;

  /// dufs web password.
  final String password;

  final http.Client _http;

  /// HTTP Basic auth headers — also passed to `Image.network` and the video
  /// player so media requests are authenticated too.
  Map<String, String> get authHeaders => <String, String>{
    'authorization':
        'Basic ${base64Encode(utf8.encode('$username:$password'))}',
  };

  /// Builds the authenticated absolute URL of a cloud [path].
  Uri fileUri(String path) => _uri(path);

  /// URL of the generated thumbnail for a media entry (see
  /// `generate_thumbnails.sh`); falls back to an icon when it 404s.
  Uri thumbUri(String path) => _uri('/.thumbs${paths.normalize(path)}.jpg');

  Uri _uri(String path) {
    final root = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    final encoded = path
        .split('/')
        .where((s) => s.isNotEmpty)
        .map(Uri.encodeComponent)
        .join('/');
    return Uri.parse('$root/$encoded');
  }

  /// Lists directory [dirPath] via WebDAV PROPFIND.
  Future<List<DirEntry>> list(String dirPath) async {
    final request = http.Request('PROPFIND', _uri(dirPath))
      ..headers.addAll(<String, String>{...authHeaders, 'depth': '1'});
    final response = await _http.send(request);
    final body = await response.stream.bytesToString();
    if (response.statusCode >= 400) {
      throw Exception('PROPFIND $dirPath -> ${response.statusCode}');
    }
    return parsePropfind(body, dirPath);
  }

  /// Uploads [length] bytes of [data] to [dirPath]/[name] with a WebDAV PUT,
  /// streaming the body so a large file never sits in memory whole. Reports
  /// the running byte count through [onProgress]; [cancel] is checked between
  /// chunks and aborts the request with [TransferCancelled].
  Future<void> upload(
    String dirPath,
    String name,
    Stream<List<int>> data,
    int length, {
    void Function(int sent)? onProgress,
    TransferCancel? cancel,
  }) async {
    final target = dirPath.endsWith('/') ? '$dirPath$name' : '$dirPath/$name';
    // A known length goes out as Content-Length; an unknown one (a provider
    // that reported 0 for a file it is still writing) as chunked encoding,
    // since a wrong Content-Length aborts the request mid-body.
    final request = http.StreamedRequest('PUT', _uri(target))
      ..headers.addAll(authHeaders)
      ..contentLength = length > 0 ? length : null;
    // The sink must be fed concurrently with send(): draining the source into
    // it first would buffer the whole file, which is what this replaces. An
    // early error response (e.g. 401) stops the pump through [abort] so it
    // does not keep buffering into a dead connection.
    final abort = TransferCancel();
    final sent = _http.send(request)..ignore();
    final pump = pumpUpload(data, request.sink, onProgress, [abort, ?cancel]);
    final response = await Future.any<http.StreamedResponse?>([
      sent,
      pump.then((_) => null),
    ]);
    if (response != null && response.statusCode >= 400) {
      abort.cancel();
      throw Exception('PUT $target -> ${response.statusCode}');
    }
    await pump;
    final finished = response ?? await sent;
    if (finished.statusCode >= 400) {
      throw Exception('PUT $target -> ${finished.statusCode}');
    }
  }

  /// Downloads a file chunk by chunk into [onChunk], never holding the whole
  /// body in memory. [onProgress] gets the running byte count; [cancel] is
  /// checked between chunks and tears down the connection.
  Future<void> download(
    String path, {
    required void Function(List<int> chunk) onChunk,
    void Function(int received)? onProgress,
    TransferCancel? cancel,
  }) async {
    final request = http.Request('GET', _uri(path))
      ..headers.addAll(authHeaders);
    final response = await _http.send(request);
    if (response.statusCode >= 400) {
      throw Exception('GET $path -> ${response.statusCode}');
    }
    var received = 0;
    await for (final chunk in response.stream) {
      cancel?.check();
      onChunk(chunk);
      received += chunk.length;
      onProgress?.call(received);
    }
  }

  /// Deletes a file or directory.
  Future<void> delete(String path) async {
    final response = await _http.delete(_uri(path), headers: authHeaders);
    if (response.statusCode >= 400) {
      throw Exception('DELETE $path -> ${response.statusCode}');
    }
  }

  /// Creates a directory at [path] (WebDAV MKCOL).
  Future<void> createDir(String path) async {
    final request = http.Request('MKCOL', _uri(path))
      ..headers.addAll(authHeaders);
    final response = await _http.send(request);
    if (response.statusCode >= 400) {
      throw Exception('MKCOL $path -> ${response.statusCode}');
    }
  }

  /// Moves [fromPath] into directory [destDir], keeping its base name (MOVE).
  Future<void> move(String fromPath, String destDir) async {
    final dest = paths.joinPath(destDir, paths.basename(fromPath));
    final request = http.Request('MOVE', _uri(fromPath))
      ..headers.addAll(<String, String>{
        ...authHeaders,
        'destination': _uri(dest).toString(),
        'overwrite': 'F',
      });
    final response = await _http.send(request);
    if (response.statusCode >= 400) {
      throw Exception('MOVE $fromPath -> ${response.statusCode}');
    }
  }

  /// Renames [path] to [newName], keeping it in the same directory (MOVE).
  Future<void> rename(String path, String newName) async {
    final dest = paths.joinPath(paths.parentPath(path), newName);
    final request = http.Request('MOVE', _uri(path))
      ..headers.addAll(<String, String>{
        ...authHeaders,
        'destination': _uri(dest).toString(),
        'overwrite': 'F',
      });
    final response = await _http.send(request);
    if (response.statusCode >= 400) {
      throw Exception('MOVE $path -> ${response.statusCode}');
    }
  }

  /// Reads a text file's contents.
  Future<String> readText(String path) async {
    final response = await _http.get(_uri(path), headers: authHeaders);
    if (response.statusCode >= 400) {
      throw Exception('GET $path -> ${response.statusCode}');
    }
    return response.body;
  }

  /// Writes [content] to a text file (WebDAV PUT).
  Future<void> writeText(String path, String content) async {
    final response = await _http.put(
      _uri(path),
      headers: authHeaders,
      body: content,
    );
    if (response.statusCode >= 400) {
      throw Exception('PUT $path -> ${response.statusCode}');
    }
  }

  /// Fetches the server metadata index (`/.meta/index.json`); resolves to an
  /// empty index on a missing file, non-ok status, network failure, or bad
  /// JSON — the index is an optional enrichment, never a hard dependency.
  Future<MetaIndex> fetchMeta() async {
    try {
      final response = await _http.get(
        _uri('/.meta/index.json'),
        headers: authHeaders,
      );
      if (response.statusCode >= 400) return <String, MediaMeta>{};
      return metaIndexFromJson(jsonDecode(response.body));
    } on Exception {
      return <String, MediaMeta>{};
    }
  }

  /// Releases the underlying HTTP client.
  void close() => _http.close();
}
