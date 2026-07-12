import 'package:dufs_client/screens/text_editor_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

DufsClient _client(MockClient mock) => DufsClient(
      baseUrl: 'https://host',
      username: 'u',
      password: 'p',
      httpClient: mock,
    );

Widget _app(DufsClient client) => MaterialApp(
      home: TextEditorScreen(client: client, path: '/n.txt', title: 'n.txt'),
    );

void main() {
  testWidgets('loads text, edits and saves', (tester) async {
    final methods = <String>[];
    final client = _client(MockClient((req) async {
      methods.add(req.method);
      if (req.method == 'GET') return http.Response('hello', 200);
      return http.Response('', 200);
    }));
    await tester.pumpWidget(_app(client));
    await tester.pumpAndSettle();
    expect(find.text('hello'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'edited');
    await tester.tap(find.byIcon(Icons.save));
    await tester.pumpAndSettle();
    expect(methods, contains('PUT'));
    expect(find.text('Saved n.txt'), findsOneWidget);
  });

  testWidgets('surfaces a load error', (tester) async {
    final client = _client(MockClient((_) async => http.Response('', 500)));
    await tester.pumpWidget(_app(client));
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not open'), findsOneWidget);
    // Save is disabled when the file failed to load.
    final save =
        tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.save));
    expect(save.onPressed, isNull);
  });

  testWidgets('surfaces a save error', (tester) async {
    final client = _client(MockClient((req) async {
      if (req.method == 'GET') return http.Response('x', 200);
      return http.Response('', 500);
    }));
    await tester.pumpWidget(_app(client));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.save));
    await tester.pumpAndSettle();
    expect(find.textContaining('Save failed'), findsOneWidget);
  });
}
