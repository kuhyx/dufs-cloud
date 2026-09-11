import 'package:dufs_client/services/public_downloads.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel(PublicDownloads.channelName);
  final calls = <MethodCall>[];

  void handle(Future<Object?> Function(MethodCall call) handler) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) {
      calls.add(call);
      return handler(call);
    });
  }

  setUp(calls.clear);

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('save() forwards the staged path and reads back where it landed',
      () async {
    handle((call) async => <String, String>{
          'uri': 'content://media/downloads/7',
          'name': 'x (1).bin',
          'relativePath': 'Download/',
          'mime': 'application/octet-stream',
        });
    final saved = await PublicDownloads().save('/tmp/x.bin', 'x.bin');
    expect(calls.single.method, 'saveToDownloads');
    expect(calls.single.arguments, {'tempPath': '/tmp/x.bin', 'name': 'x.bin'});
    expect(saved.uri, 'content://media/downloads/7');
    expect(saved.name, 'x (1).bin');
    expect(saved.location, 'Download/x (1).bin');
    expect(saved.mime, 'application/octet-stream');
  });

  test('save() throws when the platform returns nothing', () async {
    handle((call) async => null);
    await expectLater(
      PublicDownloads().save('/tmp/x.bin', 'x.bin'),
      throwsA(isA<PlatformException>()),
    );
  });

  test('save() surfaces a platform error', () async {
    handle((call) async => throw PlatformException(code: 'save'));
    await expectLater(
      PublicDownloads().save('/tmp/x.bin', 'x.bin'),
      throwsA(isA<PlatformException>()),
    );
  });

  test('open() passes uri + mime and reports whether a viewer took it',
      () async {
    const file = SavedFile(
      uri: 'content://media/downloads/7',
      name: 'x.bin',
      relativePath: 'Download/',
      mime: 'application/zip',
    );
    handle((call) async => true);
    expect(await PublicDownloads().open(file), isTrue);
    expect(calls.single.method, 'openUri');
    expect(
      calls.single.arguments,
      {'uri': 'content://media/downloads/7', 'mime': 'application/zip'},
    );
    handle((call) async => false);
    expect(await PublicDownloads().open(file), isFalse);
    handle((call) async => null);
    expect(await PublicDownloads().open(file), isFalse);
  });
}
