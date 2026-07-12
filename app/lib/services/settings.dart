import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persists dufs connection settings: URL + username in shared preferences,
/// password in secure storage (the platform keystore).
class Settings {
  Settings._(this._prefs);

  static const String _kUrl = 'dufs_url';
  static const String _kUser = 'dufs_user';
  static const String _kPass = 'dufs_pass';
  static const FlutterSecureStorage _secure = FlutterSecureStorage();

  final SharedPreferences _prefs;

  /// Loads settings from disk.
  static Future<Settings> load() async {
    return Settings._(await SharedPreferences.getInstance());
  }

  /// Base URL of the dufs server, e.g. `https://kuhy-cloud.duckdns.org`.
  String get baseUrl => _prefs.getString(_kUrl) ?? '';

  /// dufs web username.
  String get username => _prefs.getString(_kUser) ?? '';

  /// Whether the minimum settings (URL + username) are present.
  bool get isConfigured => baseUrl.isNotEmpty && username.isNotEmpty;

  /// Reads the stored password (empty if unset).
  Future<String> password() async {
    return await _secure.read(key: _kPass) ?? '';
  }

  /// Persists the URL, username and password.
  Future<void> save({
    required String baseUrl,
    required String username,
    required String password,
  }) async {
    await _prefs.setString(_kUrl, baseUrl.trim());
    await _prefs.setString(_kUser, username.trim());
    await _secure.write(key: _kPass, value: password);
  }
}
