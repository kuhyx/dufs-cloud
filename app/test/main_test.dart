import 'package:dufs_client/main.dart' as app;
import 'package:dufs_client/screens/browser_screen.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/secure_storage_mock.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    installSecureStorageMock();
  });

  testWidgets('DufsApp builds a MaterialApp hosting the browser',
      (tester) async {
    final settings = await Settings.load();
    await tester.pumpWidget(app.DufsApp(settings: settings));
    await tester.pump();
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.byType(BrowserScreen), findsOneWidget);
  });

  testWidgets('main() boots the app', (tester) async {
    await app.main();
    await tester.pump();
    expect(find.byType(app.DufsApp), findsOneWidget);
  });
}
