import 'dart:io' show HttpDate;

import 'package:dufs_client/models/dir_entry.dart';
import 'package:xml/xml.dart';

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
