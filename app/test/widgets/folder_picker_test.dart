import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/widgets/folder_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

String _xml(String self, List<String> dirs) {
  final base = self == '/' ? '' : self;
  final sb = StringBuffer('<D:multistatus xmlns:D="DAV:">');
  for (final name in dirs) {
    sb.write('<D:response><D:href>$base/$name/</D:href><D:propstat><D:prop>'
        '<D:resourcetype><D:collection/></D:resourcetype>'
        '</D:prop></D:propstat></D:response>');
  }
  sb.write('</D:multistatus>');
  return sb.toString();
}

DufsClient _client(
  Map<String, List<String>> tree, {
  Set<String> fail = const {},
}) =>
    DufsClient(
      baseUrl: 'https://host',
      username: 'u',
      password: 'p',
      httpClient: MockClient((req) async {
        final path = Uri.decodeComponent(req.url.path);
        if (fail.contains(path)) return http.Response('', 500);
        return http.Response(_xml(path, tree[path] ?? const []), 207);
      }),
    );

/// Pushes a [FolderPicker], settles, and returns a holder for the popped path.
Future<ValueNotifier<String?>> _open(
  WidgetTester tester,
  DufsClient client,
  String initial,
) async {
  final result = ValueNotifier<String?>(null);
  await tester.pumpWidget(MaterialApp(
    home: Builder(
      builder: (ctx) => Scaffold(
        body: Center(
          child: ElevatedButton(
            onPressed: () async => result.value =
                await Navigator.of(ctx).push<String>(MaterialPageRoute<String>(
              builder: (_) => FolderPicker(
                client: client,
                initialPath: initial,
                count: 2,
              ),
            )),
            child: const Text('open'),
          ),
        ),
      ),
    ),
  ));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return result;
}

void main() {
  testWidgets('lists folders and picks the current directory', (tester) async {
    final result = await _open(tester, _client({'/': ['Media', 'Docs']}), '/');
    expect(find.text('..'), findsNothing); // no up-row at the root
    expect(find.text('Media'), findsOneWidget);
    await tester.tap(find.text('Move here'));
    await tester.pumpAndSettle();
    expect(result.value, '/');
  });

  testWidgets('descends into a folder and steps back up', (tester) async {
    final result = await _open(
      tester,
      _client({
        '/Media': ['2026'],
        '/Media/2026': ['07'],
      }),
      '/Media',
    );
    await tester.tap(find.text('2026'));
    await tester.pumpAndSettle();
    expect(find.text('07'), findsOneWidget);
    await tester.tap(find.text('..'));
    await tester.pumpAndSettle();
    expect(find.text('2026'), findsOneWidget);
    await tester.tap(find.text('Move here'));
    await tester.pumpAndSettle();
    expect(result.value, '/Media');
  });

  testWidgets('surfaces a load error', (tester) async {
    final result = await _open(tester, _client(const {}, fail: {'/'}), '/');
    expect(find.textContaining('Could not load'), findsOneWidget);
    await tester.tap(find.text('Move here'));
    await tester.pumpAndSettle();
    expect(result.value, '/');
  });
}
