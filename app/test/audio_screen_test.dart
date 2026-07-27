import 'dart:async';

import 'package:dufs_client/screens/audio_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_app_player.dart';

DufsClient _client() =>
    DufsClient(baseUrl: 'https://host', username: 'u', password: 'p');

AudioScreen _screen(FakeAppPlayer player) => AudioScreen(
      client: _client(),
      path: '/song.mp3',
      title: 'song.mp3',
      playerFactory: () => player,
    );

/// Pumps the screen and lets the player report that it is playing a 10s track.
Future<FakeAppPlayer> _ready(WidgetTester tester) async {
  final player = FakeAppPlayer();
  await tester.pumpWidget(MaterialApp(home: _screen(player)));
  await tester.pumpAndSettle();
  player
    ..emitDuration(const Duration(seconds: 10))
    ..emitPosition(const Duration(seconds: 2))
    ..emitPlaying(value: true);
  await tester.pumpAndSettle();
  return player;
}

void main() {
  testWidgets('shows a spinner, then the controls once playing',
      (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pumpAndSettle();
    player.emitPlaying(value: true);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.pause_circle), findsOneWidget);
    expect(find.text('song.mp3'), findsOneWidget);
    expect(player.opened.single.toString(), contains('song.mp3'));
    expect(player.headers, containsPair('authorization', startsWith('Basic ')));
  });

  testWidgets('renders the elapsed and total time', (tester) async {
    await _ready(tester);
    expect(find.text('00:02 / 00:10'), findsOneWidget);
  });

  testWidgets('formats durations past an hour', (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    player
      ..emitDuration(const Duration(hours: 1, minutes: 2, seconds: 3))
      ..emitPosition(const Duration(hours: 1));
    await tester.pumpAndSettle();
    expect(find.text('1:00:00 / 1:02:03'), findsOneWidget);
  });

  testWidgets('toggles play and pause', (tester) async {
    final player = await _ready(tester);

    await tester.tap(find.byIcon(Icons.pause_circle));
    await tester.pump();
    expect(player.resumed, isFalse);

    player.emitPlaying(value: false);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.play_circle), findsOneWidget);

    await tester.tap(find.byIcon(Icons.play_circle));
    await tester.pump();
    expect(player.resumed, isTrue);
  });

  testWidgets('seeks via the slider', (tester) async {
    final player = await _ready(tester);
    await tester.drag(find.byType(Slider), const Offset(60, 0));
    await tester.pump();
    expect(player.seeks, isNotEmpty);
  });

  testWidgets('an unknown duration still gives a usable slider',
      (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    // Duration stays zero; a zero max would assert inside Slider.
    expect(find.byType(Slider), findsOneWidget);
    expect(find.text('00:00 / 00:00'), findsOneWidget);
    expect(player.seeks, isEmpty);
  });

  testWidgets('a position past the reported duration is clamped',
      (tester) async {
    final player = FakeAppPlayer();
    await tester.pumpWidget(MaterialApp(home: _screen(player)));
    await tester.pumpAndSettle();
    player
      ..emitDuration(const Duration(seconds: 5))
      ..emitPosition(const Duration(seconds: 9));
    await tester.pumpAndSettle();
    // Slider would assert if value exceeded max.
    expect(find.byType(Slider), findsOneWidget);
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
    await tester.pump();
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    gate.complete();
    await tester.pumpAndSettle();
    expect(player.disposed, isTrue);
    expect(find.byIcon(Icons.pause_circle), findsNothing);
  });
}
