import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dufs_client/screens/audio_screen.dart';
import 'package:dufs_client/screens/browser_screen.dart';
import 'package:dufs_client/screens/image_screen.dart';
import 'package:dufs_client/screens/pdf_screen.dart';
import 'package:dufs_client/screens/settings_screen.dart';
import 'package:dufs_client/screens/video_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:dufs_client/util/filter_sort.dart';
import 'package:dufs_client/widgets/filter_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart'
    show ShareParams, ShareResult, ShareResultStatus;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/fake_video_platform.dart';
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
  Future<ShareResult> Function(ShareParams)? share,
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
      shareSheet: share,
    ),
  );
}

Future<Directory> _tmpDir() async =>
    Directory.systemTemp.createTemp('dufs_test');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    VideoPlayerPlatform.instance = FakeVideoPlayerPlatform();
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
    'opening a video plays its proxy in preference to the original',
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
      final videoScreen = tester.widget<VideoScreen>(find.byType(VideoScreen));
      expect(videoScreen.path, '/.proxies/clip.mp4.mp4');
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

  testWidgets('download selected as a zip hands a file to the share sheet',
      (tester) async {
    final settings = await _settings(configured: true);
    final shared = <ShareParams>[];
    await tester.pumpWidget(_browser(
      settings,
      _mock(),
      docs: _tmpDir,
      share: (params) async {
        shared.add(params);
        return const ShareResult('ok', ShareResultStatus.success);
      },
    ));
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
    expect(shared, hasLength(1));
    expect(shared.first.files!.single.name, 'dufs-selection.zip');
    expect(find.text('1 selected'), findsNothing); // selection cleared
  });

  testWidgets('a zip build failure shows a snackbar', (tester) async {
    final settings = await _settings(configured: true);
    await tester.pumpWidget(_browser(
      settings,
      _mock(downloadFail: true),
      docs: _tmpDir,
      share: (params) async =>
          const ShareResult('ok', ShareResultStatus.success),
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
