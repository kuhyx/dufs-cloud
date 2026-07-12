import 'dart:io';
import 'dart:typed_data';

import 'package:dufs_client/screens/browser_screen.dart';
import 'package:dufs_client/screens/image_screen.dart';
import 'package:dufs_client/screens/settings_screen.dart';
import 'package:dufs_client/screens/video_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'support/fake_video_platform.dart';
import 'support/secure_storage_mock.dart';

String _listing(List<(String, bool, int)> items) {
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

const _root = [
  ('/Sub/', true, 0),
  ('/pic.jpg', false, 10),
  ('/clip.mp4', false, 20),
  ('/doc.txt', false, 30),
  ('/data.bin', false, 40),
];

MockClient _mock({
  bool listFail = false,
  bool downloadFail = false,
  bool uploadFail = false,
  bool deleteFail = false,
  bool mkcolFail = false,
}) {
  return MockClient((req) async {
    switch (req.method) {
      case 'MKCOL':
        return mkcolFail ? http.Response('', 409) : http.Response('', 201);
      case 'PROPFIND':
        if (listFail) return http.Response('', 500);
        if (req.url.path == '/Sub') return http.Response(_listing([]), 207);
        return http.Response(_listing(_root), 207);
      case 'GET':
        return downloadFail
            ? http.Response('', 500)
            : http.Response.bytes([1, 2, 3], 200);
      case 'PUT':
        return uploadFail ? http.Response('', 500) : http.Response('', 201);
      case 'DELETE':
        return deleteFail ? http.Response('', 500) : http.Response('', 204);
      default:
        return http.Response('', 400);
    }
  });
}

Future<Settings> _settings({required bool configured}) async {
  SharedPreferences.setMockInitialValues(
    configured ? {'dufs_url': 'https://h', 'dufs_user': 'u'} : {},
  );
  installSecureStorageMock();
  return Settings.load();
}

Widget _browser(
  Settings settings,
  http.Client mock, {
  Future<XFile?> Function()? pick,
  Future<Directory> Function()? docs,
}) {
  return MaterialApp(
    home: BrowserScreen(
      settings: settings,
      clientFactory: ({
        required baseUrl,
        required username,
        required password,
      }) =>
          DufsClient(
        baseUrl: baseUrl,
        username: username,
        password: password,
        httpClient: mock,
      ),
      pickMedia: pick,
      documentsDir: docs,
    ),
  );
}

Future<Directory> _tmpDir() async =>
    Directory.systemTemp.createTemp('dufs_test');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    VideoPlayerPlatform.instance = FakeVideoPlayerPlatform();
  });

  testWidgets('unconfigured shows a hint and no upload button',
      (tester) async {
    final settings = await _settings(configured: false);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    expect(find.textContaining('Tap the gear'), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsNothing);
  });

  testWidgets('lists entries with icons and sizes', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    expect(find.text('Sub'), findsOneWidget);
    expect(find.text('pic.jpg'), findsOneWidget);
    expect(find.text('clip.mp4'), findsOneWidget);
    expect(find.text('doc.txt'), findsOneWidget);
    expect(find.text('30 B'), findsOneWidget);
    expect(find.byIcon(Icons.folder), findsOneWidget);
    expect(find.byIcon(Icons.insert_drive_file), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsOneWidget);
  });

  testWidgets('opening a folder, then going up', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sub'));
    await tester.pumpAndSettle();
    expect(find.text('This folder is empty.'), findsOneWidget);
    expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
    await tester.tap(find.byIcon(Icons.arrow_upward));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('opening an image pushes the image screen', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('pic.jpg'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(ImageScreen), findsOneWidget);
  });

  testWidgets('opening a video pushes the video screen', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('clip.mp4'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(VideoScreen), findsOneWidget);
  });

  testWidgets('tapping a non-media, non-text file downloads it',
      (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock(), docs: _tmpDir));
    await tester.pumpAndSettle();
    // The download does real temp-file I/O, so drive it in the real zone.
    await tester.runAsync(() async {
      await tester.tap(find.text('data.bin'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(find.textContaining('Saved data.bin'), findsOneWidget);
    await tester.pumpAndSettle();
  });

  testWidgets('tapping a text file opens the editor', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('doc.txt'));
    await tester.pumpAndSettle();
    // The editor screen shows a Save action.
    expect(find.byTooltip('Save'), findsOneWidget);
  });

  testWidgets('download via the popup menu, and a download error',
      (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(
      _browser(settings, _mock(downloadFail: true), docs: _tmpDir),
    );
    await tester.pumpAndSettle();
    // The last tile is a file (folders sort first); open its menu.
    await tester.tap(find.byIcon(Icons.more_vert).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Download'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Download failed'), findsOneWidget);
  });

  testWidgets('delete confirmed reloads; cancel does nothing', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();

    // Cancel path.
    await tester.tap(find.byType(PopupMenuButton<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);

    // Confirm path.
    await tester.tap(find.byType(PopupMenuButton<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('delete error shows a snackbar', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock(deleteFail: true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(PopupMenuButton<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Delete failed'), findsOneWidget);
  });

  testWidgets('new folder: create, cancel and error', (tester) async {
    // Cancel (and empty-name) path: no MKCOL.
    final methods = <String>[];
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, MockClient((req) async {
      methods.add(req.method);
      if (req.method == 'MKCOL') return http.Response('', 201);
      return http.Response(_listing(_root), 207);
    })));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.create_new_folder));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(methods, isNot(contains('MKCOL')));

    // Create with a blank name is a no-op too.
    await tester.tap(find.byIcon(Icons.create_new_folder));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();
    expect(methods, isNot(contains('MKCOL')));

    // Create with a name → MKCOL.
    await tester.tap(find.byIcon(Icons.create_new_folder));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Trips');
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();
    expect(methods, contains('MKCOL'));
  });

  testWidgets('new folder surfaces an error', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock(mkcolFail: true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.create_new_folder));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'X');
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Create failed'), findsOneWidget);
  });

  testWidgets('upload a picked file, then a cancelled pick', (tester) async {
    final settings = await _settings(configured: true);
    final puts = <String>[];
    final mock = MockClient((req) async {
      if (req.method == 'PUT') puts.add(req.url.path);
      if (req.method == 'PROPFIND') {
        return http.Response(_listing(_root), 207);
      }
      return http.Response('', 201);
    });
    final tmp = Directory.systemTemp.createTempSync('dufs_pick');
    final file = File('${tmp.path}/up.png')..writeAsBytesSync([1, 2, 3]);
    final picked = XFile(file.path);
    var returnFile = true;
    await tester.pumpWidget(
      _browser(settings, mock, pick: () async => returnFile ? picked : null),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();
    expect(puts, contains('/up.png'));

    // Cancelled pick returns null and uploads nothing further.
    returnFile = false;
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 100));
    });
    await tester.pumpAndSettle();
    expect(puts.length, 1);
  });

  testWidgets('upload error shows a snackbar', (tester) async {
    final settings = await _settings(configured: true);
    final picked = XFile.fromData(Uint8List.fromList([1]), name: 'u.png');
    await tester.pumpWidget(
      _browser(settings, _mock(uploadFail: true), pick: () async => picked),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(find.textContaining('Upload failed'), findsOneWidget);
  });

  testWidgets('a listing error is surfaced', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock(listFail: true)));
    await tester.pumpAndSettle();
    expect(find.textContaining('Exception'), findsOneWidget);
  });

  testWidgets('opening settings and saving re-bootstraps', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    expect(find.byType(SettingsScreen), findsOneWidget);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    // Back on the browser after re-bootstrap.
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('closing settings without saving keeps the listing',
      (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('pull to refresh reloads the listing', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    await tester.fling(find.text('pic.jpg'), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });
}
