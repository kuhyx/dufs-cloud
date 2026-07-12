import 'package:dufs_client/screens/settings_screen.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/secure_storage_mock.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<Settings> makeSettings(Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues(prefs);
    installSecureStorageMock();
    return Settings.load();
  }

  testWidgets('prefills, edits and saves, popping true', (tester) async {
    final settings = await makeSettings({});
    bool? popped;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: ElevatedButton(
              onPressed: () async {
                popped = await Navigator.of(context).push<bool>(
                  MaterialPageRoute<bool>(
                    builder: (_) => SettingsScreen(settings: settings),
                  ),
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    // Default URL is prefilled when unset.
    expect(find.text('https://kuhy-cloud.duckdns.org'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), 'https://h');
    await tester.enterText(find.byType(TextField).at(1), 'bob');
    await tester.enterText(find.byType(TextField).at(2), 'pw');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(popped, isTrue);
    final reloaded = await Settings.load();
    expect(reloaded.baseUrl, 'https://h');
    expect(reloaded.username, 'bob');
    expect(await reloaded.password(), 'pw');
  });

  testWidgets('prefills existing url and password', (tester) async {
    final settings = await makeSettings({
      'dufs_url': 'https://existing',
      'dufs_user': 'alice',
    });
    await settings.save(
      baseUrl: 'https://existing',
      username: 'alice',
      password: 'stored',
    );
    await tester.pumpWidget(
      MaterialApp(home: SettingsScreen(settings: settings)),
    );
    await tester.pumpAndSettle();
    expect(find.text('https://existing'), findsOneWidget);
    expect(find.text('alice'), findsOneWidget);
  });
}
