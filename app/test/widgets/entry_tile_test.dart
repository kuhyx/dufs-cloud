import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/widgets/entry_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

DufsClient _client() => DufsClient(
      baseUrl: 'https://h',
      username: 'u',
      password: 'p',
      httpClient: MockClient((_) async => http.Response('', 200)),
    );

DirEntry _entry(String name, EntryKind kind, {int size = 10}) =>
    DirEntry(name: name, path: '/$name', kind: kind, size: size);

Future<void> _pump(WidgetTester tester, Widget tile) => tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GridView(
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 160,
            ),
            children: [tile],
          ),
        ),
      ),
    );

void main() {
  testWidgets('folder tile shows a folder icon and no size', (tester) async {
    var tapped = false;
    await _pump(
      tester,
      EntryTile(
        client: _client(),
        entry: _entry('Media', EntryKind.dir),
        onTap: () => tapped = true,
      ),
    );
    await tester.pump();
    expect(find.byIcon(Icons.folder), findsOneWidget);
    await tester.tap(find.text('Media'));
    expect(tapped, isTrue);
  });

  testWidgets('image tile falls back to an icon when the thumbnail fails',
      (tester) async {
    await _pump(
      tester,
      EntryTile(
        client: _client(),
        entry: _entry('pic.jpg', EntryKind.file),
        onTap: () {},
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.image), findsOneWidget);
    expect(find.text('10 B'), findsOneWidget);
  });

  testWidgets('type icons for video, text and other', (tester) async {
    for (final (name, icon) in [
      ('clip.mp4', Icons.movie),
      ('n.txt', Icons.description),
      ('data.bin', Icons.insert_drive_file),
    ]) {
      await _pump(
        tester,
        EntryTile(
          client: _client(),
          entry: _entry(name, EntryKind.file),
          onTap: () {},
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byIcon(icon), findsOneWidget);
    }
  });

  testWidgets('file menu triggers download and delete', (tester) async {
    var downloaded = false;
    var deleted = false;
    await _pump(
      tester,
      EntryTile(
        client: _client(),
        entry: _entry('data.bin', EntryKind.file),
        onTap: () {},
        onDownload: () => downloaded = true,
        onDelete: () => deleted = true,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Download'));
    await tester.pumpAndSettle();
    expect(downloaded, isTrue);
    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(deleted, isTrue);
  });

  testWidgets('selection checkbox toggles', (tester) async {
    var toggled = false;
    await _pump(
      tester,
      EntryTile(
        client: _client(),
        entry: _entry('data.bin', EntryKind.file),
        onTap: () {},
        selected: false,
        onToggleSelect: () => toggled = true,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox));
    expect(toggled, isTrue);
  });
}
