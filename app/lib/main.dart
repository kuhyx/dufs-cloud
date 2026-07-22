import 'package:dufs_client/screens/browser_screen.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:dufs_client/ui/theme.dart';
import 'package:flutter/material.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final settings = await Settings.load();
  runApp(DufsApp(settings: settings));
}

/// Root widget of the dufs mobile client.
class DufsApp extends StatelessWidget {
  /// Creates the app with the loaded [settings].
  const DufsApp({required this.settings, super.key});

  /// Persisted connection settings.
  final Settings settings;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cloud',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(Brightness.light),
      darkTheme: buildAppTheme(Brightness.dark),
      home: BrowserScreen(settings: settings),
    );
  }
}
