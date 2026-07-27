import 'dart:async';

import 'package:dufs_client/screens/video_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/util/subtitle_track.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_app_player.dart';

DufsClient _client() =>
    DufsClient(baseUrl: 'https://host', username: 'u', password: 'p');

VideoScreen _screen(FakeAppPlayer player) => VideoScreen(
      client: _client(),
      path: '/clip.mkv',
      title: 'clip.mkv',
      playerFactory: () => player,
    );

/// The three-track shape of `[Foxtrot] Look Back (2024)`: two tracks flagged
/// default, one of them Japanese, plus a forced signs-only English track.
const _foxtrot = [
  SubtitleTrackInfo(
    id: '3',
    language: 'eng',
    title: 'Foxtrot',
    isDefault: true,
  ),
  SubtitleTrackInfo(
    id: '4',
    language: 'eng',
    title: 'signs/songs',
    isForced: true,
  ),
  SubtitleTrackInfo(
    id: '5',
    language: 'jpn',
    title: '日本語',
    isDefault: true,
  ),
];

void main() {
  testWidgets('shows a spinner, then the video surface once opened',
      (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pumpAndSettle();
    expect(find.byKey(const Key('fake-surface')), findsOneWidget);
    expect(find.text('clip.mkv'), findsOneWidget);
    expect(player.opened.single.toString(), contains('clip.mkv'));
    expect(player.headers, containsPair('authorization', startsWith('Basic ')));
  });

  testWidgets('streams the original path, never a .proxies remux',
      (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    expect(player.opened.single.path, isNot(contains('.proxies')));
  });

  testWidgets('shows an error message when opening fails', (tester) async {
    final player = FakeAppPlayer()..failOpen = true;
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not play'), findsOneWidget);
    expect(player.disposed, isTrue);
  });

  testWidgets('disposes the player if unmounted during open', (tester) async {
    final gate = Completer<void>();
    final player = FakeAppPlayer()..openGate = gate;
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pump(); // _init starts and blocks on the gate
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    gate.complete();
    await tester.pumpAndSettle();
    expect(player.disposed, isTrue);
    expect(find.byKey(const Key('fake-surface')), findsNothing);
  });

  testWidgets('no subtitle button until tracks are demuxed', (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    expect(find.byType(PopupMenuButton<String>), findsNothing);

    player.emitTracks(_foxtrot);
    await tester.pumpAndSettle();
    expect(find.byType(PopupMenuButton<String>), findsOneWidget);
  });

  testWidgets('auto-selects English over a default-flagged Japanese track',
      (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();

    player.emitTracks(_foxtrot);
    await tester.pumpAndSettle();
    expect(player.selections.single?.id, '3');
  });

  testWidgets('re-emitted tracks do not override a manual choice',
      (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    player.emitTracks(_foxtrot);
    await tester.pumpAndSettle();

    // Pick Japanese by hand, then let the demuxer report tracks again.
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Japanese — 日本語'));
    await tester.pumpAndSettle();
    player.emitTracks(_foxtrot);
    await tester.pumpAndSettle();

    expect(player.selections.map((t) => t?.id), ['3', '5']);
  });

  testWidgets('the Off entry disables subtitles', (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    player.emitTracks(_foxtrot);
    await tester.pumpAndSettle();

    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Off'));
    await tester.pumpAndSettle();

    expect(player.selections.last, isNull);
    expect(find.byIcon(Icons.subtitles_off_outlined), findsOneWidget);
  });

  testWidgets('lists every track with a readable label', (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    player.emitTracks(_foxtrot);
    await tester.pumpAndSettle();

    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    expect(find.text('English — Foxtrot'), findsOneWidget);
    expect(find.text('English — signs/songs (forced)'), findsOneWidget);
    expect(find.text('Japanese — 日本語'), findsOneWidget);
  });

  testWidgets('a later emission can still auto-select after a barren one',
      (tester) async {
    // Regression: Matroska tracks arrive progressively. Latching on the first
    // non-empty emission left subtitles off for the whole file when that
    // emission held only the forced signs/songs track.
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();

    player.emitTracks(const [
      SubtitleTrackInfo(
        id: '4',
        language: 'eng',
        title: 'signs/songs',
        isForced: true,
      ),
    ]);
    await tester.pumpAndSettle();
    expect(player.selections, isEmpty);

    player.emitTracks(_foxtrot);
    await tester.pumpAndSettle();
    expect(player.selections.single?.id, '3');
  });

  testWidgets('a track id that vanished turns subtitles off, not sideways',
      (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    player.emitTracks(_foxtrot);
    await tester.pumpAndSettle();

    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    // The demuxer renumbers while the menu is open.
    player.emitTracks(const [
      SubtitleTrackInfo(id: '7', language: 'tha', title: 'NF'),
    ]);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Japanese — 日本語'));
    await tester.pumpAndSettle();

    // Never a language the user did not ask for.
    expect(player.selections.last, isNull);
  });

  testWidgets('empty track list leaves subtitles off', (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    player.emitTracks([]);
    await tester.pumpAndSettle();
    expect(player.selections, isEmpty);
    expect(find.byType(PopupMenuButton<String>), findsNothing);
  });
}
