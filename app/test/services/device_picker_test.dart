
import 'package:dufs_client/services/device_picker.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel(DevicePicker.channelName);
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

  test('pick() maps the platform list and streams bytes in chunks', () async {
    // Three reads: two full chunks, then the empty end-of-file marker.
    final chunks = <Uint8List>[
      Uint8List.fromList([1, 2]),
      Uint8List.fromList([3]),
      Uint8List(0),
    ];
    handle((call) async {
      switch (call.method) {
        case 'pickFiles':
          return <Map<Object?, Object?>>[
            {'uri': 'content://a', 'name': 'a.txt', 'size': 3},
            {'uri': 'content://b', 'name': 'b.bin', 'size': 4000000000},
          ];
        case 'openRead':
          return 42;
        case 'readChunk':
          return chunks.removeAt(0);
        case 'closeRead':
          return true;
      }
      return null;
    });
    final picked = await DevicePicker(chunkSize: 2).pick();
    expect(picked.map((f) => f.name), ['a.txt', 'b.bin']);
    expect(picked.map((f) => f.size), [3, 4000000000]);

    final bytes = await picked.first.open().toList();
    expect(bytes, [
      [1, 2],
      [3],
    ]);
    final methods = calls.map((c) => c.method).toList();
    expect(methods, [
      'pickFiles',
      'openRead',
      'readChunk',
      'readChunk',
      'readChunk',
      'closeRead',
    ]);
    expect(calls[1].arguments, {'uri': 'content://a'});
    expect(calls[2].arguments, {'handle': 42, 'size': 2});
    expect(calls.last.arguments, {'handle': 42});
  });

  test('a cancelled pick is an empty list', () async {
    handle((call) async => null);
    expect(await DevicePicker().pick(), isEmpty);
    expect(DevicePicker().chunkSize, DevicePicker.defaultChunkSize);
  });

  test('a null chunk ends the stream and the reader is still closed',
      () async {
    handle((call) async {
      switch (call.method) {
        case 'pickFiles':
          return <Map<Object?, Object?>>[
            {'uri': 'content://a', 'name': 'a.txt', 'size': 0},
          ];
        case 'openRead':
          return 7;
        default:
          return null;
      }
    });
    final picked = await DevicePicker().pick();
    expect(await picked.single.open().toList(), isEmpty);
    expect(calls.last.method, 'closeRead');
  });

  test('a read error still closes the reader', () async {
    handle((call) async {
      switch (call.method) {
        case 'pickFiles':
          return <Map<Object?, Object?>>[
            {'uri': 'content://a', 'name': 'a.txt', 'size': 1},
          ];
        case 'openRead':
          return 7;
        case 'readChunk':
          throw PlatformException(code: 'io');
        default:
          return null;
      }
    });
    final picked = await DevicePicker().pick();
    await expectLater(
      picked.single.open().toList(),
      throwsA(isA<PlatformException>()),
    );
    expect(calls.last.method, 'closeRead');
  });
}
