import 'package:dufs_client/models/transfer_progress.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/dufs_client_harness.dart';

void main() {
  group('DufsClient requests', () {
    test('upload() PUTs to dir/name and joins a trailing slash', () async {
      final seen = <String>[];
      final client = clientWith(
        MockClient((req) async {
          seen.add(req.url.path);
          return http.Response('', 201);
        }),
      );
      await client.upload('/dir', 'n.txt', Stream.value([1, 2, 3]), 3);
      await client.upload('/dir/', 'm.txt', Stream.value([4]), 1);
      expect(seen, ['/dir/n.txt', '/dir/m.txt']);
    });

    test(
      'upload() streams the body with Content-Length and progress',
      () async {
        var length = -1;
        final body = <int>[];
        final client = clientWith(
          MockClient.streaming((req, bytes) async {
            length = req.contentLength ?? -1;
            body.addAll(await bytes.expand((c) => c).toList());
            return http.StreamedResponse(const Stream.empty(), 201);
          }),
        );
        final ticks = <int>[];
        await client.upload(
          '/d',
          'n',
          Stream.fromIterable([
            [1, 2],
            [3],
            [4, 5, 6],
          ]),
          6,
          onProgress: ticks.add,
        );
        expect(length, 6);
        expect(body, [1, 2, 3, 4, 5, 6]);
        expect(ticks, [2, 3, 6]);
      },
    );

    test(
      'upload() sends an unknown size as chunked (no Content-Length)',
      () async {
        int? length = 0;
        final client = clientWith(
          MockClient.streaming((req, bytes) async {
            length = req.contentLength;
            await bytes.drain<void>();
            return http.StreamedResponse(const Stream.empty(), 201);
          }),
        );
        await client.upload('/d', 'n', Stream.value([1]), 0);
        expect(length, isNull);
      },
    );

    test('upload() throws on an error status', () async {
      final client = clientWith(
        MockClient((_) async => http.Response('', 500)),
      );
      await expectLater(
        client.upload('/d', 'n', Stream.value([0]), 1),
        throwsException,
      );
    });

    test(
      'upload() stops pumping once an early error response arrives',
      () async {
        // The server rejects before reading the body (e.g. 401): the pump must
        // not keep feeding a dead connection until the whole file is read.
        final client = clientWith(
          MockClient.streaming((req, bytes) async {
            return http.StreamedResponse(const Stream.empty(), 401);
          }),
        );
        var produced = 0;
        Stream<List<int>> endless() async* {
          while (true) {
            produced++;
            await Future<void>.delayed(Duration.zero);
            yield [0];
          }
        }

        await expectLater(
          client.upload('/d', 'n', endless(), 1 << 30),
          throwsException,
        );
        expect(produced, lessThan(1000));
      },
    );

    test(
      'upload() cancel stops the body and throws TransferCancelled',
      () async {
        final cancel = TransferCancel();
        final client = clientWith(
          MockClient.streaming((req, bytes) async {
            await bytes.drain<void>();
            return http.StreamedResponse(const Stream.empty(), 201);
          }),
        );
        var produced = 0;
        Stream<List<int>> source() async* {
          for (var i = 0; i < 100; i++) {
            produced++;
            yield [i];
          }
        }

        await expectLater(
          client.upload(
            '/d',
            'n',
            source(),
            100,
            cancel: cancel,
            onProgress: (sent) {
              if (sent >= 3) cancel.cancel();
            },
          ),
          throwsA(isA<TransferCancelled>()),
        );
        expect(produced, lessThan(100));
      },
    );

    test(
      'download() hands chunks to onChunk with a running byte count',
      () async {
        final ok = clientWith(
          MockClient.streaming((req, _) async {
            return http.StreamedResponse(
              Stream.fromIterable([
                [9, 9],
                [8],
              ]),
              200,
            );
          }),
        );
        final got = <int>[];
        final ticks = <int>[];
        await ok.download('/f', onChunk: got.addAll, onProgress: ticks.add);
        expect(got, [9, 9, 8]);
        expect(ticks, [2, 3]);
        final bad = clientWith(MockClient((_) async => http.Response('', 403)));
        await expectLater(bad.download('/f', onChunk: (_) {}), throwsException);
      },
    );

    test('download() cancel tears the stream down between chunks', () async {
      final cancel = TransferCancel();
      var produced = 0;
      Stream<List<int>> body() async* {
        for (var i = 0; i < 100; i++) {
          produced++;
          yield [i];
        }
      }

      final client = clientWith(
        MockClient.streaming((req, _) async {
          return http.StreamedResponse(body(), 200);
        }),
      );
      final got = <int>[];
      await expectLater(
        client.download(
          '/f',
          onChunk: got.addAll,
          onProgress: (n) {
            if (n >= 2) cancel.cancel();
          },
          cancel: cancel,
        ),
        throwsA(isA<TransferCancelled>()),
      );
      expect(got, [0, 1]);
      expect(produced, lessThan(100));
    });
  });
}
