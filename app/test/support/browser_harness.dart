import 'dart:io';

import 'package:dufs_client/models/upload_source.dart';
import 'package:dufs_client/screens/browser_screen.dart';
import 'package:dufs_client/services/completion_cue.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/services/public_downloads.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:dufs_client/ui/theme.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'secure_storage_mock.dart';

/// A WebDAV multistatus body for `(href, isDir, size)` items.
String listingXml(List<(String, bool, int)> items) {
  final buf = StringBuffer('<D:multistatus xmlns:D="DAV:">');
  for (final (href, isDir, size) in items) {
    buf.write('<D:response><D:href>$href</D:href><D:propstat><D:prop>');
    if (isDir) {
      buf.write('<D:resourcetype><D:collection/></D:resourcetype>');
    } else {
      buf.write(
        '<D:resourcetype/><D:getcontentlength>$size</D:getcontentlength>',
      );
    }
    buf.write('</D:prop></D:propstat></D:response>');
  }
  buf.write('</D:multistatus>');
  return buf.toString();
}

/// The cloud root used by the browser-screen tests.
const rootListing = [
  ('/Sub/', true, 0),
  ('/pic.jpg', false, 10),
  ('/clip.mp4', false, 20),
  ('/doc.txt', false, 30),
  ('/data.bin', false, 40),
];

/// Settings pointing at a fake host (or unconfigured), with the secure-storage
/// channel mocked.
Future<Settings> testSettings({required bool configured}) async {
  SharedPreferences.setMockInitialValues(
    configured ? {'dufs_url': 'https://h', 'dufs_user': 'u'} : {},
  );
  installSecureStorageMock();
  return await Settings.load();
}

/// A [BrowserScreen] wired to [mock] instead of the network. The optional
/// seams stand in for the file picker, temp dir and MediaStore.
Widget browserApp(
  Settings settings,
  http.Client mock, {
  Future<List<UploadSource>> Function()? pick,
  Future<Directory> Function()? tmp,
  PublicDownloads? downloads,
  CompletionCue? cue,
}) {
  return MaterialApp(
    builder: hideTooltips,
    home: BrowserScreen(
      settings: settings,
      clientFactory:
          ({required baseUrl, required username, required password}) =>
              DufsClient(
                baseUrl: baseUrl,
                username: username,
                password: password,
                httpClient: mock,
              ),
      pickUploads: pick,
      tempDir: tmp,
      publicDownloads: downloads,
      completionCue: cue,
    ),
  );
}
