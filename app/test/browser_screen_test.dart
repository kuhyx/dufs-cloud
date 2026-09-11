import 'dart:convert';
import 'dart:io';

import 'package:dufs_client/models/upload_source.dart';
import 'package:dufs_client/screens/audio_screen.dart';
import 'package:dufs_client/screens/browser_screen.dart';
import 'package:dufs_client/screens/image_screen.dart';
import 'package:dufs_client/screens/pdf_screen.dart';
import 'package:dufs_client/screens/settings_screen.dart';
import 'package:dufs_client/screens/video_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/services/public_downloads.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:dufs_client/util/filter_sort.dart';
import 'package:dufs_client/widgets/filter_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/fake_webview_platform.dart';
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
  bool moveFail = false,
}) {
  return MockClient((req) async {
    switch (req.method) {
      case 'MKCOL':
        return mkcolFail ? http.Response('', 409) : http.Response('', 201);
      case 'MOVE':
        return moveFail ? http.Response('', 409) : http.Response('', 201);
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

// Serves the full root listing once, then a listing with clip.mp4 removed —
// i.e. the file disappears server-side between the initial load and a
// pull-to-refresh. fetchMeta uses GET, so the first PROPFIND is the load.
MockClient _mockVanishing() {
  var listings = 0;
  return MockClient((req) async {
    if (req.method != 'PROPFIND') return http.Response('', 400);
    final gone = listings++ > 0;
    final items = gone
        ? _root.where((e) => e.$1 != '/clip.mp4').toList()
        : _root;
    return http.Response(_listing(items), 207);
  });
}

Future<Settings> _settings({required bool configured}) async {
  SharedPreferences.setMockInitialValues(
    configured ? {'dufs_url': 'https://h', 'dufs_user': 'u'} : {},
  );
  installSecureStorageMock();
  return await Settings.load();
}

// Stands in for the MediaStore channel: records what was staged, answers
// with a renamed file (as MediaStore does on collision), and reports whether
// a viewer took the Open.
class _FakeDownloads extends PublicDownloads {
  _FakeDownloads({this.openOk = true, this.failSave = false});

  final bool openOk;
  final bool failSave;
  final List<String> staged = <String>[];
  final List<SavedFile> opened = <SavedFile>[];

  @override
  Future<SavedFile> save(String tempPath, String name) async {
    if (failSave) throw Exception('MediaStore insert returned null');
    staged.add(tempPath);
    return SavedFile(
      uri: 'content://media/downloads/1',
      name: '$name (1)',
      relativePath: 'Download/',
      mime: 'application/octet-stream',
    );
  }

  @override
  Future<bool> open(SavedFile file) async {
    opened.add(file);
    return openOk;
  }
}

UploadSource _src(String name, List<int> bytes) => UploadSource(
      name: name,
      size: bytes.length,
      open: () => Stream.value(bytes),
    );

// A GET whose body dribbles out slowly, so a test can cancel mid-stream.
http.StreamedResponse _slowBody(int status) {
  Stream<List<int>> body() async* {
    for (var i = 0; i < 60; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
      yield [i];
    }
  }

  return http.StreamedResponse(body(), status);
}

MockClient _mockSlowGet() {
  return MockClient.streaming((req, body) async {
    if (req.method == 'PROPFIND') {
      return http.StreamedResponse(
        Stream.value(utf8.encode(_listing(_root))),
        207,
      );
    }
    if (req.method == 'GET' && req.url.path.endsWith('index.json')) {
      return http.StreamedResponse(const Stream.empty(), 404);
    }
    if (req.method == 'GET') return _slowBody(200);
    await body.drain<void>();
    return http.StreamedResponse(const Stream.empty(), 201);
  });
}

Widget _browser(
  Settings settings,
  http.Client mock, {
  Future<List<UploadSource>> Function()? pick,
  Future<Directory> Function()? tmp,
  PublicDownloads? downloads,
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
      pickUploads: pick,
      tempDir: tmp,
      publicDownloads: downloads,
    ),
  );
}

Future<Directory> _tmpDir() => Directory.systemTemp.createTemp('dufs_test');

// Lets a flow that was started in the fake zone cross several real-I/O
// awaits: each round lets the event loop deliver one completion, then a
// pump runs its continuation up to the next await.
Future<void> _settleIo(WidgetTester tester, {int rounds = 6}) async {
  for (var i = 0; i < rounds; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // BrowserScreen pushes a real VideoScreen, which builds a MediaKitPlayer
  // (libmpv) rather than a fake — so the native library has to be loaded here
  // exactly as main.dart does it.
  MediaKit.ensureInitialized();

  setUp(() {
    WebViewPlatform.instance = FakeWebViewPlatform();
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

  testWidgets(
    'opening a video plays the original even when a proxy exists',
    (tester) async {
      final settings = await _settings(configured: true);
      final mock = MockClient((req) async {
        if (req.method == 'PROPFIND') {
          return http.Response(_listing(_root), 207);
        }
        if (req.url.path == '/.meta/index.json') {
          return http.Response(
            jsonEncode({
              'entries': {
                '/clip.mp4': {'proxyPath': '/.proxies/clip.mp4.mp4'},
              },
            }),
            200,
          );
        }
        return http.Response.bytes([1, 2, 3], 200);
      });
      await tester.pumpWidget(_browser(settings, mock));
      await tester.pumpAndSettle();
      await tester.tap(find.text('clip.mp4'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      // The proxy is built with `-map 0:v:0 -map 0:a:0?`, so it has no
      // subtitle tracks; libmpv can play the original container directly.
      final videoScreen = tester.widget<VideoScreen>(find.byType(VideoScreen));
      expect(videoScreen.path, '/clip.mp4');
    },
  );

  testWidgets(
    'opening a video prefers the app proxy when the index has one',
    (tester) async {
      final settings = await _settings(configured: true);
      final mock = MockClient((req) async {
        if (req.method == 'PROPFIND') {
          return http.Response(_listing(_root), 207);
        }
        if (req.url.path == '/.meta/index.json') {
          return http.Response(
            jsonEncode({
              'entries': {
                '/clip.mp4': {
                  'proxyPath': '/.proxies/clip.mp4.mp4',
                  'appProxyPath': '/.proxies/clip.mp4.app.mkv',
                },
              },
            }),
            200,
          );
        }
        return http.Response.bytes([1, 2, 3], 200);
      });
      await tester.pumpWidget(_browser(settings, mock));
      await tester.pumpAndSettle();
      await tester.tap(find.text('clip.mp4'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      // The app proxy exists only when libmpv cannot decode the original's
      // audio (TrueHD/MLP); it is Matroska and keeps the subtitle tracks, so
      // it wins over both the original and the browser `.mp4` proxy.
      final videoScreen = tester.widget<VideoScreen>(find.byType(VideoScreen));
      expect(videoScreen.path, '/.proxies/clip.mp4.app.mkv');
    },
  );

  testWidgets('opening audio pushes the audio screen', (tester) async {
    final settings = await _settings(configured: true);
    final mock = MockClient((req) async {
      if (req.method == 'PROPFIND') {
        return http.Response(
          _listing([('/song.mp3', false, 10)]),
          207,
        );
      }
      return http.Response.bytes([1, 2, 3], 200);
    });
    await tester.pumpWidget(_browser(settings, mock));
    await tester.pumpAndSettle();
    await tester.tap(find.text('song.mp3'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(AudioScreen), findsOneWidget);
  });

  testWidgets('opening a PDF pushes the PDF screen', (tester) async {
    final settings = await _settings(configured: true);
    final mock = MockClient((req) async {
      if (req.method == 'PROPFIND') {
        return http.Response(
          _listing([('/doc.pdf', false, 10)]),
          207,
        );
      }
      return http.Response.bytes([1, 2, 3], 200);
    });
    await tester.pumpWidget(_browser(settings, mock));
    await tester.pumpAndSettle();
    await tester.tap(find.text('doc.pdf'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(PdfScreen), findsOneWidget);
  });

  testWidgets('tapping a non-media, non-text file saves it to Download/ '
      'and offers to open it', (tester) async {
    // It used to write the file into app-private storage and say so, which
    // named a location no file manager can open. Now the bytes are staged in
    // the temp dir, moved into the public Download/ collection, and the toast
    // names the spot MediaStore actually chose (renamed on collision).
    final settings = await _settings(configured: true);
    final downloads = _FakeDownloads();
    await tester.pumpWidget(
      _browser(settings, _mock(), tmp: _tmpDir, downloads: downloads),
    );
    await tester.pumpAndSettle();
    // The download does real temp-file I/O, so drive it in the real zone.
    await tester.runAsync(() async {
      await tester.tap(find.text('data.bin'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(downloads.staged.single, endsWith('data.bin'));
    expect(File(downloads.staged.single).readAsBytesSync(), [1, 2, 3]);
    expect(find.text('Saved to Download/data.bin (1)'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1)); // snackbar slides in
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(downloads.opened.single.name, 'data.bin (1)');
    expect(find.textContaining('No app can open'), findsNothing);
  });

  testWidgets('Open with no viewer says so', (tester) async {
    final settings = await _settings(configured: true);
    final downloads = _FakeDownloads(openOk: false);
    await tester.pumpWidget(
      _browser(settings, _mock(), tmp: _tmpDir, downloads: downloads),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.text('data.bin'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    await tester.pump(const Duration(seconds: 1)); // snackbar slides in
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('No app can open data.bin (1)'), findsOneWidget);
  });

  testWidgets('a MediaStore failure is a download failure', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(
      settings,
      _mock(),
      tmp: _tmpDir,
      downloads: _FakeDownloads(failSave: true),
    ));
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.text('data.bin'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(find.textContaining('Download failed'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('a download shows progress and can be cancelled',
      (tester) async {
    final settings = await _settings(configured: true);
    final downloads = _FakeDownloads();
    // Sync: an awaited real I/O future never completes in the fake zone.
    final tmp = Directory.systemTemp.createTempSync('dufs_test');
    await tester.pumpWidget(_browser(
      settings,
      _mockSlowGet(),
      tmp: () async => tmp,
      downloads: downloads,
    ));
    await tester.pumpAndSettle();
    // pump() must stay outside runAsync, so the cancel is a second block;
    // the body keeps dribbling in real time in between.
    await tester.runAsync(() async {
      await tester.tap(find.text('data.bin'));
      await Future<void>.delayed(const Duration(milliseconds: 150));
    });
    await tester.pump();
    expect(find.text('Downloading 1/1 · data.bin'), findsOneWidget);
    expect(find.textContaining('% · '), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(find.text('Cancel'));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pump();
    expect(find.text('Download cancelled'), findsOneWidget);
    expect(find.text('Cancel'), findsNothing);
    expect(downloads.staged, isEmpty);
    // The half-written staging file is gone, so nothing partial lingers.
    expect(tmp.listSync(), isEmpty);
    await tester.pump(const Duration(seconds: 5));
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
      _browser(settings, _mock(downloadFail: true), tmp: _tmpDir),
    );
    await tester.pumpAndSettle();
    // The last tile is a file (folders sort first); open its menu.
    await tester.tap(find.byIcon(Icons.more_vert).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Download'));
    await tester.pump();
    // Staging dir, sink close and partial delete are all real I/O.
    await _settleIo(tester);
    expect(find.textContaining('Download failed'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
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

  testWidgets('rename: pre-filled, cancel, unchanged, and a successful rename',
      (tester) async {
    final methods = <String>[];
    String? destination;
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, MockClient((req) async {
      methods.add(req.method);
      if (req.method == 'MOVE') {
        destination = req.headers['destination'];
        return http.Response('', 201);
      }
      return http.Response(_listing(_root), 207);
    })));
    await tester.pumpAndSettle();
    // The last tile is a file (folders sort first): pic.jpg.

    // Cancel: pre-filled with the current name, no MOVE.
    await tester.tap(find.byType(PopupMenuButton<String>).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rename'));
    await tester.pumpAndSettle();
    final field = tester.widget<TextField>(find.descendant(
      of: find.byType(AlertDialog),
      matching: find.byType(TextField),
    ));
    expect(field.controller?.text, 'pic.jpg');
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(methods, isNot(contains('MOVE')));

    // Confirming with the name unchanged is a no-op too.
    await tester.tap(find.byType(PopupMenuButton<String>).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rename'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Rename'));
    await tester.pumpAndSettle();
    expect(methods, isNot(contains('MOVE')));

    // A real rename → MOVE with the new destination.
    await tester.tap(find.byType(PopupMenuButton<String>).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rename'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        ),
        'renamed.jpg');
    await tester.tap(find.widgetWithText(FilledButton, 'Rename'));
    await tester.pumpAndSettle();
    expect(methods, contains('MOVE'));
    expect(destination, endsWith('/renamed.jpg'));
  });

  testWidgets('rename surfaces a snackbar on failure', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock(moveFail: true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(PopupMenuButton<String>).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rename'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        ),
        'renamed.jpg');
    await tester.tap(find.widgetWithText(FilledButton, 'Rename'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Rename failed'), findsOneWidget);
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
    await tester.enterText(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        ),
        'Trips');
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
    await tester.enterText(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        ),
        'X');
    await tester.tap(find.widgetWithText(FilledButton, 'Create'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Create failed'), findsOneWidget);
  });

  testWidgets('uploads every picked file, then a cancelled pick',
      (tester) async {
    final settings = await _settings(configured: true);
    final puts = <String>[];
    final bodies = <String, List<int>>{};
    final mock = MockClient.streaming((req, body) async {
      if (req.method == 'PUT') {
        puts.add(req.url.path);
        bodies[req.url.path] = await body.expand((c) => c).toList();
      }
      if (req.method == 'PROPFIND') {
        return http.StreamedResponse(
          Stream.value(utf8.encode(_listing(_root))),
          207,
        );
      }
      return http.StreamedResponse(const Stream.empty(), 201);
    });
    var files = [
      _src('up.png', [1, 2, 3]),
      _src('note.txt', [4]),
    ];
    await tester.pumpWidget(_browser(settings, mock, pick: () async => files));
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();
    expect(puts, ['/up.png', '/note.txt']);
    expect(bodies['/up.png'], [1, 2, 3]);
    expect(find.text('Uploaded 2 files'), findsOneWidget);

    // Cancelled pick returns nothing and uploads nothing further.
    files = [];
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 100));
    });
    await tester.pumpAndSettle();
    expect(puts.length, 2);
  });

  testWidgets('one failed upload does not abort the batch and is named',
      (tester) async {
    final settings = await _settings(configured: true);
    final mock = MockClient((req) async {
      if (req.method == 'PUT' && req.url.path == '/bad.bin') {
        return http.Response('', 500);
      }
      if (req.method == 'PROPFIND') return http.Response(_listing(_root), 207);
      return http.Response('', 201);
    });
    await tester.pumpWidget(_browser(
      settings,
      mock,
      pick: () async => [
        _src('a.png', [1]),
        _src('bad.bin', [2]),
        _src('c.png', [3]),
      ],
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(find.text('1 of 3 failed: bad.bin'), findsOneWidget);
  });

  testWidgets('a single upload reports in the singular', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(
      settings,
      _mock(),
      pick: () async => [
        _src('a.png', [1]),
      ],
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(find.text('Uploaded 1 file'), findsOneWidget);
  });

  // Cancels a two-file batch during the first (slow) file. With [deleteFail]
  // the server refuses to remove the partial, which must not change the
  // outcome the user sees.
  Future<void> cancelUpload(WidgetTester tester,
      {required bool deleteFail}) async {
    final settings = await _settings(configured: true);
    final methods = <String>[];
    final mock = MockClient.streaming((req, body) async {
      methods.add('${req.method} ${req.url.path}');
      if (req.method == 'PROPFIND') {
        return http.StreamedResponse(
          Stream.value(utf8.encode(_listing(_root))),
          207,
        );
      }
      if (req.method == 'DELETE' && deleteFail) {
        return http.StreamedResponse(const Stream.empty(), 500);
      }
      await body.drain<void>();
      return http.StreamedResponse(const Stream.empty(), 201);
    });
    Stream<List<int>> slow() async* {
      for (var i = 0; i < 60; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
        yield [i];
      }
    }

    await tester.pumpWidget(_browser(
      settings,
      mock,
      pick: () async => [
        UploadSource(name: 'slow.bin', size: 60, open: slow),
        _src('never.bin', [1]),
      ],
    ));
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      await tester.tap(find.byType(FloatingActionButton));
      await Future<void>.delayed(const Duration(milliseconds: 150));
    });
    await tester.pump();
    expect(find.text('Uploading 1/2 · slow.bin'), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(find.text('Cancel'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(find.text('Cancelled after 0 of 2'), findsOneWidget);
    expect(methods, contains('DELETE /slow.bin'));
    expect(methods, isNot(contains('PUT /never.bin')));
    await tester.pump(const Duration(seconds: 5));
  }

  testWidgets('cancelling an upload stops the batch and removes the partial',
      (tester) => cancelUpload(tester, deleteFail: false));

  testWidgets('a partial that cannot be removed still reads as cancelled',
      (tester) => cancelUpload(tester, deleteFail: true));

  testWidgets('upload error shows a snackbar', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(
      settings,
      _mock(uploadFail: true),
      pick: () async => [
        _src('u.png', [1]),
      ],
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(find.text('1 of 1 failed: u.png'), findsOneWidget);
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

  testWidgets('searching filters the whole cloud into a collapsible group',
      (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();

    // Typing in the AppBar search box activates the filter, which lazily
    // indexes the cloud and re-renders matches grouped by their folder.
    await tester.enterText(find.byType(TextField), 'pic');
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
    expect(find.text('clip.mp4'), findsNothing); // filtered out by the query
    // The single match lives at the root, so one '/' group header appears.
    expect(find.text('/'), findsOneWidget);

    // Collapsing the group header hides its grid; expanding restores it.
    await tester.tap(find.text('/'));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsNothing);
    await tester.tap(find.text('/'));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('shows an indexing state while the cloud is walked',
      (tester) async {
    final settings = await _settings(configured: true);
    // A deliberately slow PROPFIND keeps the index build pending long enough
    // to observe the intermediate "Indexing…" frame before it resolves.
    final mock = MockClient((req) async {
      switch (req.method) {
        case 'PROPFIND':
          await Future<void>.delayed(const Duration(milliseconds: 40));
          if (req.url.path == '/Sub') return http.Response(_listing([]), 207);
          return http.Response(_listing(_root), 207);
        default:
          return http.Response.bytes([1, 2, 3], 200);
      }
    });
    await tester.pumpWidget(_browser(settings, mock));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'pic');
    await tester.pump(); // one frame: filter active, index still building
    expect(find.text('Indexing the cloud…'), findsOneWidget);
    await tester.pumpAndSettle(); // drain the delayed walk
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('a query with no matches shows the empty-filter message',
      (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'zzzzz');
    await tester.pumpAndSettle();
    expect(find.text('Nothing matches your filters.'), findsOneWidget);
  });

  testWidgets("the sheet's Clear button also empties the search box",
      (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'clip');
    await tester.pumpAndSettle();
    expect(find.text('clip'), findsOneWidget);

    await tester.tap(find.byTooltip('Filters'));
    await tester.pumpAndSettle();
    final clear = find.widgetWithText(TextButton, 'Clear');
    await tester.ensureVisible(clear);
    await tester.pumpAndSettle();
    await tester.tap(clear);
    await tester.pumpAndSettle();

    // Leaving the old query on screen would advertise a filter that is no
    // longer applied.
    expect(find.text('clip'), findsNothing);
  });

  testWidgets('the filter sheet edits type and sort', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Filters'));
    await tester.pumpAndSettle();
    expect(find.byType(FilterSheet), findsOneWidget);

    // Toggling sort direction routes through the sheet's onSort callback.
    await tester.tap(find.byTooltip('Ascending'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Descending'), findsOneWidget);

    // Choosing a type from the dropdown routes through onFilter.
    await tester.tap(find.byType(DropdownButton<TypeFilter>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Images').last);
    await tester.pumpAndSettle();
    expect(find.byType(FilterSheet), findsOneWidget);
  });

  testWidgets('long-press enters multi-select; tap toggles; close exits',
      (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byTooltip('Move'), findsOneWidget);

    // A tile's checkbox toggles it, as does tapping the tile body.
    await tester.tap(find.byType(Checkbox).first);
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);
    await tester.tap(find.byType(Checkbox).first);
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);

    // Tapping another tile adds it; tapping it again removes it.
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);

    // Close returns to the normal browse bar (the search field reappears).
    await tester.tap(find.byTooltip('Cancel selection'));
    await tester.pumpAndSettle();
    expect(find.text('1 selected'), findsNothing);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('range select: arms, selects the anchor..target range, disarms',
      (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock()));
    await tester.pumpAndSettle();
    // Sorted (dirs first, then name asc): Sub, clip.mp4, data.bin, doc.txt,
    // pic.jpg.

    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);

    await tester.tap(find.byTooltip('Select range'));
    await tester.pump();
    expect(find.byTooltip('Range select armed — tap an item'), findsOneWidget);

    await tester.tap(find.text('pic.jpg'));
    await tester.pump();
    // clip.mp4..pic.jpg inclusive = clip.mp4, data.bin, doc.txt, pic.jpg.
    expect(find.text('4 selected'), findsOneWidget);
    // Armed state cleared after the range tap.
    expect(find.byTooltip('Select range'), findsOneWidget);

    // The anchor moved to pic.jpg; a plain tap elsewhere just toggles it.
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('3 selected'), findsOneWidget);
  });

  testWidgets('range select falls back to a plain toggle when the anchor '
      'vanished from the listing', (tester) async {
    final settings = await _settings(configured: true);
    // Pull-to-refresh stays available in select mode and does not clear the
    // selection, so the anchor can disappear server-side under us.
    await tester.pumpWidget(_browser(settings, _mockVanishing()));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();
    await tester.tap(find.byTooltip('Select range'));
    await tester.pump();

    await tester.fling(find.text('doc.txt'), const Offset(0, 300), 1000);
    await tester.pumpAndSettle();
    expect(find.text('clip.mp4'), findsNothing);
    // Still armed, and clip.mp4 is still counted even though it is gone.
    expect(find.byTooltip('Range select armed — tap an item'), findsOneWidget);
    expect(find.text('1 selected'), findsOneWidget);

    // No resolvable anchor: the tap degrades to a plain toggle and disarms.
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);
    expect(find.byTooltip('Select range'), findsOneWidget);

    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);
  });

  // Drives a long-press drag from [from] to [to], asserting the drag
  // feedback appears mid-gesture, and returns after the drop settles.
  Future<void> dragOnto(
    WidgetTester tester,
    Finder from,
    Finder to, {
    required String expectFeedback,
  }) async {
    final gesture = await tester.startGesture(tester.getCenter(from));
    await tester.pump(const Duration(milliseconds: 700));
    await gesture.moveTo(tester.getCenter(to));
    await tester.pump();
    expect(find.text(expectFeedback), findsOneWidget);
    await gesture.up();
    await tester.pumpAndSettle();
  }

  testWidgets('drag in select mode moves the selection into a folder',
      (tester) async {
    final settings = await _settings(configured: true);
    final methods = <String>[];
    String? destination;
    final mock = MockClient((req) async {
      methods.add(req.method);
      if (req.method == 'MOVE') {
        destination = req.headers['destination'];
        return http.Response('', 201);
      }
      if (req.url.path == '/Sub') return http.Response(_listing([]), 207);
      return http.Response(_listing(_root), 207);
    });
    await tester.pumpWidget(_browser(settings, mock));
    await tester.pumpAndSettle();

    // Long-press enters select mode; the next long-press starts a drag.
    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);

    await dragOnto(
      tester,
      find.text('clip.mp4'),
      find.text('Sub'),
      expectFeedback: 'Move 1 item',
    );
    expect(methods.where((m) => m == 'MOVE').length, 1);
    // WebDAV's Destination is the full target URL: folder + kept name.
    expect(destination, endsWith('/Sub/clip.mp4'));
    // The move exits select mode and reloads the folder.
    expect(find.text('1 selected'), findsNothing);
  });

  testWidgets('dragging two selected items moves both', (tester) async {
    final settings = await _settings(configured: true);
    final methods = <String>[];
    final mock = MockClient((req) async {
      methods.add(req.method);
      if (req.method == 'MOVE') return http.Response('', 201);
      if (req.url.path == '/Sub') return http.Response(_listing([]), 207);
      return http.Response(_listing(_root), 207);
    });
    await tester.pumpWidget(_browser(settings, mock));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();
    await tester.tap(find.text('doc.txt'));
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);

    await dragOnto(
      tester,
      find.text('clip.mp4'),
      find.text('Sub'),
      expectFeedback: 'Move 2 items',
    );
    expect(methods.where((m) => m == 'MOVE').length, 2);
  });

  testWidgets('dragging an unselected item carries only that item',
      (tester) async {
    final settings = await _settings(configured: true);
    final destinations = <String>[];
    final mock = MockClient((req) async {
      if (req.method == 'MOVE') {
        destinations.add(req.url.path);
        return http.Response('', 201);
      }
      if (req.url.path == '/Sub') return http.Response(_listing([]), 207);
      return http.Response(_listing(_root), 207);
    });
    await tester.pumpWidget(_browser(settings, mock));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();

    // data.bin is not selected, so only it travels.
    await dragOnto(
      tester,
      find.text('data.bin'),
      find.text('Sub'),
      expectFeedback: 'Move 1 item',
    );
    expect(destinations, ['/data.bin']);
  });

  testWidgets('a folder refuses a drop of itself', (tester) async {
    final settings = await _settings(configured: true);
    final methods = <String>[];
    final mock = MockClient((req) async {
      methods.add(req.method);
      if (req.url.path == '/Sub') return http.Response(_listing([]), 207);
      return http.Response(_listing(_root), 207);
    });
    await tester.pumpWidget(_browser(settings, mock));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('Sub'));
    await tester.pump();

    await dragOnto(
      tester,
      find.text('Sub'),
      find.text('Sub'),
      expectFeedback: 'Move 1 item',
    );
    // Dropping a folder on itself would orphan its subtree: no MOVE at all,
    // and the selection is left untouched.
    expect(methods.where((m) => m == 'MOVE'), isEmpty);
    expect(find.text('1 selected'), findsOneWidget);
  });

  testWidgets('a failed drag-move is reported in a snackbar', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock(moveFail: true)));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('clip.mp4'));
    await tester.pump();

    await dragOnto(
      tester,
      find.text('clip.mp4'),
      find.text('Sub'),
      expectFeedback: 'Move 1 item',
    );
    expect(find.text('1 item(s) could not be moved'), findsOneWidget);
  });

  testWidgets('bulk delete: confirm deletes each item; cancel does not',
      (tester) async {
    final settings = await _settings(configured: true);
    final methods = <String>[];
    final mock = MockClient((req) async {
      methods.add(req.method);
      if (req.method == 'DELETE') return http.Response('', 204);
      return http.Response(_listing(_root), 207);
    });
    await tester.pumpWidget(_browser(settings, mock));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.tap(find.text('doc.txt'));
    await tester.pump();

    // Cancel the confirmation: no DELETE.
    await tester.tap(find.byTooltip('Delete'));
    await tester.pumpAndSettle();
    expect(find.text('Delete 2 items?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(methods.where((m) => m == 'DELETE'), isEmpty);

    // Confirm: one DELETE per selected item.
    await tester.tap(find.byTooltip('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(methods.where((m) => m == 'DELETE').length, 2);
    expect(find.text('2 selected'), findsNothing); // selection cleared
  });

  testWidgets('bulk delete surfaces a failure count', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(settings, _mock(deleteFail: true)));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.tap(find.byTooltip('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(find.textContaining('could not be deleted'), findsOneWidget);
  });

  testWidgets('bulk move: pick a folder, cancel, and a no-op into the same dir',
      (tester) async {
    final settings = await _settings(configured: true);
    final methods = <String>[];
    final mock = MockClient((req) async {
      methods.add(req.method);
      if (req.method == 'MOVE') return http.Response('', 201);
      if (req.url.path == '/Sub') return http.Response(_listing([]), 207);
      return http.Response(_listing(_root), 207);
    });
    await tester.pumpWidget(_browser(settings, mock));
    await tester.pumpAndSettle();

    Future<void> startMove() async {
      await tester.longPress(find.text('data.bin'));
      await tester.pump();
      await tester.tap(find.byTooltip('Move'));
      await tester.pumpAndSettle();
    }

    // Cancel the picker (system back): no MOVE.
    await startMove();
    expect(find.text('Move 1 item to…'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(methods.where((m) => m == 'MOVE'), isEmpty);

    // "Move here" at the starting folder is a no-op (dest == current path).
    await startMove();
    await tester.tap(find.widgetWithText(FilledButton, 'Move here'));
    await tester.pumpAndSettle();
    expect(methods.where((m) => m == 'MOVE'), isEmpty);

    // Descend into /Sub and move there: one MOVE.
    await startMove();
    await tester.tap(find.text('Sub'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Move here'));
    await tester.pumpAndSettle();
    expect(methods.where((m) => m == 'MOVE').length, 1);
  });

  testWidgets('download selected as a zip lands in Download/',
      (tester) async {
    final settings = await _settings(configured: true);
    final downloads = _FakeDownloads();
    await tester.pumpWidget(
      _browser(settings, _mock(), tmp: _tmpDir, downloads: downloads),
    );
    await tester.pumpAndSettle();

    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    // Real file I/O (download + temp write), so drive it in the real zone and
    // pump manually afterwards (pumpAndSettle would hang on the async gap).
    await tester.runAsync(() async {
      await tester.tap(find.byTooltip('Download zip'));
      await Future<void>.delayed(const Duration(milliseconds: 400));
    });
    await tester.pump();
    expect(downloads.staged.single, endsWith('dufs-selection.zip'));
    expect(find.text('Saved to Download/dufs-selection.zip (1)'), findsOneWidget);
    expect(find.text('1 selected'), findsNothing); // selection cleared
  });

  testWidgets('a zip download can be cancelled mid-file', (tester) async {
    final settings = await _settings(configured: true);
    final downloads = _FakeDownloads();
    await tester.pumpWidget(
      _browser(settings, _mockSlowGet(), tmp: _tmpDir, downloads: downloads),
    );
    await tester.pumpAndSettle();
    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.runAsync(() async {
      await tester.tap(find.byTooltip('Download zip'));
      await Future<void>.delayed(const Duration(milliseconds: 150));
    });
    await tester.pump();
    expect(find.text('Downloading 1/1 · data.bin'), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(find.text('Cancel'));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pump();
    expect(find.text('Zip cancelled'), findsOneWidget);
    expect(downloads.staged, isEmpty);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('a zip build failure shows a snackbar', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(
      settings,
      _mock(downloadFail: true),
      tmp: _tmpDir,
      downloads: _FakeDownloads(),
    ));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    await tester.runAsync(() async {
      await tester.tap(find.byTooltip('Download zip'));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    expect(find.textContaining('Zip failed'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5)); // drain the snackbar timer
  });
}
