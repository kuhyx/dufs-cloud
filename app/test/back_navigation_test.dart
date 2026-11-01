import 'package:dufs_client/screens/browser_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:dufs_client/widgets/folder_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/secure_storage_mock.dart';

// /A/B nested folders plus one file at the root, so a back press has two
// levels to climb and a file to long-press into selection mode.
const _tree = <String, List<(String, bool)>>{
  '/': [('A', true), ('top.bin', false)],
  '/A': [('B', true), ('a.bin', false)],
  '/A/B': [('b.bin', false)],
};

String _xml(String dir, List<(String, bool)> items) {
  final base = dir == '/' ? '' : dir;
  final sb = StringBuffer('<D:multistatus xmlns:D="DAV:">');
  for (final (name, isDir) in items) {
    sb
      ..write('<D:response><D:href>$base/$name${isDir ? '/' : ''}</D:href>')
      ..write('<D:propstat><D:prop>')
      ..write(
        isDir
            ? '<D:resourcetype><D:collection/></D:resourcetype>'
            : '<D:resourcetype/><D:getcontentlength>1</D:getcontentlength>',
      )
      ..write('</D:prop></D:propstat></D:response>');
  }
  sb.write('</D:multistatus>');
  return sb.toString();
}

final _mock = MockClient((req) async {
  if (req.method != 'PROPFIND') return http.Response('', 404);
  var path = Uri.decodeComponent(req.url.path);
  if (path.length > 1 && path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  return http.Response(_xml(path, _tree[path] ?? const []), 207);
});

DufsClient _client({
  required String baseUrl,
  required String username,
  required String password,
}) => DufsClient(
  baseUrl: baseUrl,
  username: username,
  password: password,
  httpClient: _mock,
);

Future<void> _pumpBrowser(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues({
    'dufs_url': 'https://h',
    'dufs_user': 'u',
  });
  installSecureStorageMock();
  final settings = await Settings.load();
  await tester.pumpWidget(
    MaterialApp(
      home: BrowserScreen(settings: settings, clientFactory: _client),
    ),
  );
  await tester.pumpAndSettle();
}

/// Sends an Android system back (gesture or button) and settles.
Future<void> _back(WidgetTester tester) async {
  await tester.binding.handlePopRoute();
  await tester.pumpAndSettle();
}

/// Counts `SystemNavigator.pop` calls, i.e. "the app would exit".
int Function() _watchExit() {
  var exits = 0;
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'SystemNavigator.pop') exits++;
        return null;
      });
  return () => exits;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('back climbs one folder per press, then exits at the root', (
    tester,
  ) async {
    final exits = _watchExit();
    await _pumpBrowser(tester);
    await tester.tap(find.text('A'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('B'));
    await tester.pumpAndSettle();
    expect(find.text('b.bin'), findsOneWidget);

    await _back(tester);
    expect(find.text('a.bin'), findsOneWidget);
    expect(exits(), 0);

    await _back(tester);
    expect(find.text('top.bin'), findsOneWidget);
    expect(exits(), 0);

    await _back(tester);
    expect(exits(), 1);
  });

  testWidgets('back first leaves selection mode, staying in the folder', (
    tester,
  ) async {
    final exits = _watchExit();
    await _pumpBrowser(tester);
    await tester.tap(find.text('A'));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('a.bin'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);

    await _back(tester);
    expect(find.text('1 selected'), findsNothing);
    expect(find.text('a.bin'), findsOneWidget);
    expect(exits(), 0);
  });

  testWidgets('back first clears an active search, staying in the folder', (
    tester,
  ) async {
    final exits = _watchExit();
    await _pumpBrowser(tester);
    await tester.enterText(find.byType(TextField), 'top');
    await tester.pumpAndSettle();
    expect(find.text('A'), findsNothing);

    await _back(tester);
    expect(find.text('A'), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      isEmpty,
    );
    expect(exits(), 0);
  });

  testWidgets('back in the folder picker climbs, then cancels at the root', (
    tester,
  ) async {
    String? picked = 'unset';
    final client = _client(baseUrl: 'https://h', username: 'u', password: 'p');
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (ctx) => TextButton(
            onPressed: () async => picked = await Navigator.of(ctx).push(
              MaterialPageRoute<String>(
                builder: (_) =>
                    FolderPicker(client: client, initialPath: '/A', count: 1),
              ),
            ),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('B'), findsOneWidget);

    await _back(tester);
    expect(find.byType(FolderPicker), findsOneWidget);
    expect(find.text('A'), findsOneWidget);

    await _back(tester);
    expect(find.byType(FolderPicker), findsNothing);
    expect(picked, isNull);
  });
}
