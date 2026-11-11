// Guard for the textgate rule: no chrome words on any screen kuhy sees.
// File names, typed values and units are content and are allow-listed.
import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/screens/settings_screen.dart';
import 'package:dufs_client/screens/text_editor_screen.dart';
import 'package:dufs_client/services/cloud_index.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/ui/theme.dart';
import 'package:dufs_client/widgets/folder_picker.dart';
import 'package:dufs_client/widgets/indexing_view.dart';
import 'package:dufs_client/widgets/transfer_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/browser_harness.dart';
import 'support/browser_mocks.dart';
import 'support/no_words.dart';

/// File names and extensions from [rootListing], plus filter units.
const _content = {
  'Sub', 'pic.jpg', 'clip.mp4', 'doc.txt', 'data.bin', //
  'jpg', 'mp4', 'txt', 'bin', 'MB', 'https://h',
};

Widget _shell(Widget home) => MaterialApp(builder: hideTooltips, home: home);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('unconfigured browser has no words', (tester) async {
    final settings = await testSettings(configured: false);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    expectNoWords(tester);
  });

  testWidgets('listing, menus, dialogs and select bar have no words', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    expectNoWords(tester, content: _content);

    await tester.tap(find.byType(PopupMenuButton<String>).first);
    await tester.pumpAndSettle();
    expectNoWords(tester, content: _content);
    await tester.tap(find.byIcon(Icons.delete).last);
    await tester.pumpAndSettle();
    expectNoWords(tester, content: _content);
    await tester.tap(find.byIcon(Icons.close).last);
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.create_new_folder));
    await tester.pumpAndSettle();
    expectNoWords(tester, content: _content);
    await tester.tap(find.byIcon(Icons.close).last);
    await tester.pumpAndSettle();

    await tester.longPress(find.text('data.bin'));
    await tester.pump();
    expectNoWords(tester, content: _content);
  });

  testWidgets('filter sheet has no words', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.filter_alt_outlined));
    await tester.pumpAndSettle();
    expectNoWords(tester, content: _content);
  });

  testWidgets('error snack has no words', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(
      browserApp(settings, browserMock(deleteFail: true)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(PopupMenuButton<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.delete).last);
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();
    expect(find.byType(SnackBar), findsOneWidget);
    expectNoWords(tester, content: _content);
  });

  testWidgets('settings screen has no words', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(_shell(SettingsScreen(settings: settings)));
    await tester.pumpAndSettle();
    expectNoWords(tester, content: {'https://h', 'u'});
  });

  testWidgets('folder picker, indexing and transfer banner have no words', (
    tester,
  ) async {
    final client = DufsClient(
      baseUrl: 'https://h',
      username: 'u',
      password: 'p',
      httpClient: browserMock(),
    );
    await tester.pumpWidget(
      _shell(FolderPicker(client: client, initialPath: '/', count: 2)),
    );
    await tester.pumpAndSettle();
    expectNoWords(tester, content: {..._content, '/'});

    await tester.pumpWidget(
      _shell(
        Scaffold(
          body: IndexingView(
            progress: const IndexProgress(folders: 3, entries: 9, path: '/'),
            onCancel: () {},
          ),
        ),
      ),
    );
    expectNoWords(tester);

    await tester.pumpWidget(
      _shell(
        Scaffold(
          body: TransferBanner(
            progress: const TransferProgress(
              kind: TransferKind.upload,
              index: 1,
              total: 2,
              name: 'pic.jpg',
              done: 5,
              size: 10,
            ),
            onCancel: () {},
          ),
        ),
      ),
    );
    expectNoWords(tester, content: {'1/2 · pic.jpg'});
  });

  testWidgets('text editor error and save cue have no words', (tester) async {
    final failing = DufsClient(
      baseUrl: 'https://h',
      username: 'u',
      password: 'p',
      httpClient: MockClient((_) async => http.Response('', 500)),
    );
    await tester.pumpWidget(
      _shell(TextEditorScreen(client: failing, path: '/n.txt', title: 'n.txt')),
    );
    await tester.pumpAndSettle();
    expectNoWords(tester, content: {'n.txt'});
  });
}
