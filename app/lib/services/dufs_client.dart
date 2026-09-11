import 'dart:async';
import 'dart:convert';
import 'dart:io' show HttpDate;

import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:http/http.dart' as http;
import 'package:xml/xml.dart';

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
    final pump = _pump(data, request.sink, onProgress, [abort, ?cancel]);
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

  // Feeds [data] into [sink] with backpressure: addStream pauses the source
  // whenever the socket is full, so at most a socket buffer's worth of the
  // file is ever in memory (plain sink.add would buffer without bound).
  // A cancel ends the counted stream early rather than throwing inside it,
  // because addStream forwards stream errors to the sink instead of raising
  // them here; the flag is checked afterwards and rethrown as the typed
  // exception the UI distinguishes from a failure.
  static Future<void> _pump(
    Stream<List<int>> data,
    StreamSink<List<int>> sink,
    void Function(int sent)? onProgress,
    List<TransferCancel> cancels,
  ) async {
    var cancelled = false;
    Stream<List<int>> counted() async* {
      var sent = 0;
      await for (final chunk in data) {
        if (cancels.any((c) => c.cancelled)) {
          cancelled = true;
          return;
        }
        sent += chunk.length;
        onProgress?.call(sent);
        yield chunk;
      }
    }

    await sink.addStream(counted());
    if (cancelled) sink.addError(TransferCancelled());
    // Not awaited: the close future only completes once the consumer has
    // drained the body, which never happens for an aborted request.
    unawaited(sink.close());
    if (cancelled) throw TransferCancelled();
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

/// Parses a dufs WebDAV multistatus body into the entries under [dirPath],
/// dropping the directory's own self entry. Exposed for testing.
List<DirEntry> parsePropfind(String xmlBody, String dirPath) {
  final self = _normalize(dirPath);
  final document = XmlDocument.parse(xmlBody);
  final entries = <DirEntry>[];
  final responses = document.findAllElements('response', namespaceUri: '*');
  for (final response in responses) {
    final href = response
        .findElements('href', namespaceUri: '*')
        .firstOrNull
        ?.innerText;
    if (href == null || href.isEmpty) continue;
    final path = _normalize(Uri.decodeComponent(href));
    if (path == self) continue;
    final isDir = response
        .findAllElements('collection', namespaceUri: '*')
        .isNotEmpty;
    final sizeText = response
        .findAllElements('getcontentlength', namespaceUri: '*')
        .firstOrNull
        ?.innerText;
    final mtimeText = response
        .findAllElements('getlastmodified', namespaceUri: '*')
        .firstOrNull
        ?.innerText;
    entries.add(
      DirEntry(
        name: _basename(path),
        path: path,
        kind: isDir ? EntryKind.dir : EntryKind.file,
        size: int.tryParse(sizeText ?? '') ?? 0,
        mtimeMs: _parseHttpDateMs(mtimeText),
      ),
    );
  }
  entries.sort((a, b) {
    if (a.isDir != b.isDir) return a.isDir ? -1 : 1;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });
  return entries;
}

int _parseHttpDateMs(String? text) {
  if (text == null || text.isEmpty) return 0;
  try {
    return HttpDate.parse(text).millisecondsSinceEpoch;
  } on Exception {
    return 0;
  }
}

String _normalize(String path) {
  final parts = path.split('/').where((p) => p.isNotEmpty && p != '.');
  return '/${parts.join('/')}';
}

String _basename(String path) {
  final n = _normalize(path);
  if (n == '/') return '/';
  return n.substring(n.lastIndexOf('/') + 1);
}
