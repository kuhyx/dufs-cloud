import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dufs_client/screens/pdf_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// A [DufsClient] on a fake host answering through [mock].
DufsClient pdfClient(MockClient mock) => DufsClient(
  baseUrl: 'https://host',
  username: 'u',
  password: 'p',
  httpClient: mock,
);

PdfScreen pdfScreen({
  required Future<Directory> Function() tempDir,
  DufsClient? client,
}) => PdfScreen(
  client:
      client ??
      pdfClient(MockClient((_) async => http.Response.bytes([1, 2, 3], 200))),
  path: '/doc.pdf',
  title: 'doc.pdf',
  tempDir: tempDir,
);

/// `_init()` does real disk I/O (extracting the vendored pdf.js tree,
/// downloading, binding a real HttpServer) — the default widget-test zone
/// fakes time and never services that, so it must run inside
/// [WidgetTester.runAsync]. `pumpAndSettle` also can't be used regardless:
/// the CircularProgressIndicator shown while that's in flight animates
/// forever and never lets frames go quiet (the same reason
/// video_screen_test.dart pumps explicitly instead).
Future<void> pumpUntilSettled(WidgetTester tester) async {
  for (var i = 0; i < 3000; i++) {
    if (find.byType(CircularProgressIndicator).evaluate().isEmpty) return;
    await Future<void>.delayed(const Duration(milliseconds: 10));
    await tester.pump();
  }
}

/// A bare HTTP/1.1 GET over a raw [Socket], reading only up through the
/// header terminator (no need to wait for the body or a connection close).
Future<({int status, String contentType})> rawGet(int port, String path) async {
  final socket = await Socket.connect(InternetAddress.loopbackIPv4, port);
  socket.write('GET $path HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
  final head = await socket
      .transform<String>(const _Latin1Decoder())
      .transform(const LineSplitter())
      .takeWhile((line) => line.isNotEmpty)
      .toList();
  socket.destroy();
  final status = int.parse(head.first.split(' ')[1]);
  final contentTypeLine = head.firstWhere(
    (l) => l.toLowerCase().startsWith('content-type:'),
    orElse: () => 'content-type: ',
  );
  return (status: status, contentType: contentTypeLine.split(': ')[1]);
}

/// [LineSplitter] needs a decoded [Stream<String>]; the response headers
/// are always ASCII, so a plain latin1 stream transformer suffices without
/// pulling in a UTF-8 decoder that could throw on binary body bytes we
/// never even read.
class _Latin1Decoder extends StreamTransformerBase<Uint8List, String> {
  const _Latin1Decoder();

  @override
  Stream<String> bind(Stream<Uint8List> stream) => stream.map(latin1.decode);
}
