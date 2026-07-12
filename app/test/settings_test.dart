import 'package:dufs_client/services/settings.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/secure_storage_mock.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    installSecureStorageMock();
  });

  test('defaults are empty and not configured', () async {
    final settings = await Settings.load();
    expect(settings.baseUrl, '');
    expect(settings.username, '');
    expect(settings.isConfigured, isFalse);
    expect(await settings.password(), '');
  });

  test('save persists url/user (trimmed) and password', () async {
    final settings = await Settings.load();
    await settings.save(
      baseUrl: '  https://host  ',
      username: '  bob ',
      password: 'secret',
    );
    final reloaded = await Settings.load();
    expect(reloaded.baseUrl, 'https://host');
    expect(reloaded.username, 'bob');
    expect(reloaded.isConfigured, isTrue);
    expect(await reloaded.password(), 'secret');
  });
}
