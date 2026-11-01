import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/dufs_client_harness.dart';

void main() {
  group('DufsClient requests', () {
    test('list() PROPFINDs and returns parsed entries', () async {
      late http.BaseRequest seen;
      final client = clientWith(
        MockClient((req) async {
          seen = req;
          return http.Response(propfindXml, 207);
        }),
      );
      final entries = await client.list('/Media/2026/07');
      expect(seen.method, 'PROPFIND');
      expect(seen.headers['depth'], '1');
      expect(entries.length, 2);
    });

    test('list() throws on an error status', () async {
      final client = clientWith(
        MockClient((_) async => http.Response('', 404)),
      );
      await expectLater(client.list('/x'), throwsException);
    });

    test('delete() succeeds and throws on error', () async {
      final ok = clientWith(MockClient((_) async => http.Response('', 204)));
      await ok.delete('/f');
      final bad = clientWith(MockClient((_) async => http.Response('', 404)));
      await expectLater(bad.delete('/f'), throwsException);
    });

    test('createDir() MKCOLs and throws on error', () async {
      String? method;
      final ok = clientWith(
        MockClient((req) async {
          method = req.method;
          return http.Response('', 201);
        }),
      );
      await ok.createDir('/New');
      expect(method, 'MKCOL');
      final bad = clientWith(MockClient((_) async => http.Response('', 409)));
      await expectLater(bad.createDir('/New'), throwsException);
    });

    test(
      'move() MOVEs with Destination + Overwrite and throws on error',
      () async {
        late http.BaseRequest seen;
        final ok = clientWith(
          MockClient((req) async {
            seen = req;
            return http.Response('', 204);
          }),
        );
        await ok.move('/a/pic.jpg', '/b');
        expect(seen.method, 'MOVE');
        expect(seen.headers['destination'], 'https://host/b/pic.jpg');
        expect(seen.headers['overwrite'], 'F');
        final bad = clientWith(MockClient((_) async => http.Response('', 412)));
        await expectLater(bad.move('/a/x', '/b'), throwsException);
      },
    );

    test(
      'rename() MOVEs to a new name in the same dir and throws on error',
      () async {
        late http.BaseRequest seen;
        final ok = clientWith(
          MockClient((req) async {
            seen = req;
            return http.Response('', 204);
          }),
        );
        await ok.rename('/a/old.jpg', 'new.jpg');
        expect(seen.method, 'MOVE');
        expect(seen.headers['destination'], 'https://host/a/new.jpg');
        expect(seen.headers['overwrite'], 'F');
        final bad = clientWith(MockClient((_) async => http.Response('', 412)));
        await expectLater(bad.rename('/a/x', 'y'), throwsException);
      },
    );

    test('readText() returns the body and throws on error', () async {
      final ok = clientWith(MockClient((_) async => http.Response('hi', 200)));
      expect(await ok.readText('/n.txt'), 'hi');
      final bad = clientWith(MockClient((_) async => http.Response('', 404)));
      await expectLater(bad.readText('/n.txt'), throwsException);
    });

    test('writeText() PUTs and throws on error', () async {
      String? body;
      final ok = clientWith(
        MockClient((req) async {
          body = req.body;
          return http.Response('', 200);
        }),
      );
      await ok.writeText('/n.txt', 'new');
      expect(body, 'new');
      final bad = clientWith(MockClient((_) async => http.Response('', 500)));
      await expectLater(bad.writeText('/n.txt', 'x'), throwsException);
    });

    test('fetchMeta() parses the index and is tolerant of failure', () async {
      final ok = clientWith(
        MockClient(
          (_) async =>
              http.Response('{"entries":{"/a.mp4":{"durationMs":5000}}}', 200),
        ),
      );
      final meta = await ok.fetchMeta();
      expect(meta['/a.mp4']?.durationMs, 5000);
      // non-ok status
      final missing = clientWith(
        MockClient((_) async => http.Response('', 404)),
      );
      expect(await missing.fetchMeta(), isEmpty);
      // bad JSON
      final bad = clientWith(
        MockClient((_) async => http.Response('not json', 200)),
      );
      expect(await bad.fetchMeta(), isEmpty);
      // network failure
      final offline = clientWith(
        MockClient((_) async => throw Exception('offline')),
      );
      expect(await offline.fetchMeta(), isEmpty);
    });

    test('thumbUri() points at the .thumbs mirror', () {
      final client = clientWith(
        MockClient((_) async => http.Response('', 200)),
      );
      expect(
        client.thumbUri('/Media/a b.jpg').toString(),
        'https://host/.thumbs/Media/a%20b.jpg.jpg',
      );
    });
  });
}
