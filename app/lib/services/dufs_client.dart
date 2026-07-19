import 'dart:convert';
import 'dart:io' show HttpDate;

import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
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

  /// Uploads [bytes] to [dirPath]/[name] with a WebDAV PUT.
  Future<void> upload(String dirPath, String name, List<int> bytes) async {
    final target = dirPath.endsWith('/') ? '$dirPath$name' : '$dirPath/$name';
    final response = await _http.put(_uri(target),
        headers: authHeaders, body: bytes);
    if (response.statusCode >= 400) {
      throw Exception('PUT $target -> ${response.statusCode}');
    }
  }

  /// Downloads the raw bytes of a file.
  Future<List<int>> download(String path) async {
    final response = await _http.get(_uri(path), headers: authHeaders);
    if (response.statusCode >= 400) {
      throw Exception('GET $path -> ${response.statusCode}');
    }
    return response.bodyBytes;
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
    final response =
        await _http.put(_uri(path), headers: authHeaders, body: content);
    if (response.statusCode >= 400) {
      throw Exception('PUT $path -> ${response.statusCode}');
    }
  }

  /// Fetches the server metadata index (`/.meta/index.json`); resolves to an
  /// empty index on a missing file, non-ok status, network failure, or bad
  /// JSON — the index is an optional enrichment, never a hard dependency.
  Future<MetaIndex> fetchMeta() async {
    try {
      final response =
          await _http.get(_uri('/.meta/index.json'), headers: authHeaders);
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
  for (final response in document.findAllElements('response', namespace: '*')) {
    final href = response
        .findElements('href', namespace: '*')
        .firstOrNull
        ?.innerText;
    if (href == null || href.isEmpty) continue;
    final path = _normalize(Uri.decodeComponent(href));
    if (path == self) continue;
    final isDir = response
        .findAllElements('collection', namespace: '*')
        .isNotEmpty;
    final sizeText = response
        .findAllElements('getcontentlength', namespace: '*')
        .firstOrNull
        ?.innerText;
    final mtimeText = response
        .findAllElements('getlastmodified', namespace: '*')
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
