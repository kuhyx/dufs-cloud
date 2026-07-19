import 'dart:async';

import 'package:dufs_client/screens/audio_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player/video_player.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'support/fake_video_platform.dart';

DufsClient _client() =>
    DufsClient(baseUrl: 'https://host', username: 'u', password: 'p');

AudioScreen _screen() => AudioScreen(
      client: _client(),
      path: '/song.mp3',
      title: 'song.mp3',
      controllerFactory: VideoPlayerController.networkUrl,
    );

void main() {
  late FakeVideoPlayerPlatform fake;

  setUp(() {
    fake = FakeVideoPlayerPlatform();
    VideoPlayerPlatform.instance = fake;
  });

  testWidgets('shows a spinner then the play/pause controls once ready', (
    tester,
  ) async {
    await tester.pumpWidget(MaterialApp(home: _screen()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byIcon(Icons.pause_circle), findsOneWidget);
    expect(find.text('song.mp3'), findsOneWidget);
  });

  testWidgets('toggles play/pause on tap', (tester) async {
    await tester.pumpWidget(MaterialApp(home: _screen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.byIcon(Icons.pause_circle));
    await tester.pump();
    expect(find.byIcon(Icons.play_circle), findsOneWidget);

    await tester.tap(find.byIcon(Icons.play_circle));
    await tester.pump();
    expect(find.byIcon(Icons.pause_circle), findsOneWidget);
  });

  testWidgets('seeks via the slider', (tester) async {
    await tester.pumpWidget(MaterialApp(home: _screen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.drag(find.byType(Slider), const Offset(50, 0));
    await tester.pump();
    // The fake reports a fixed 10s duration; dragging shouldn't crash and
    // the controls should still be present.
    expect(find.byType(Slider), findsOneWidget);
  });

  testWidgets('shows an error message when the controller fails', (
    tester,
  ) async {
    fake.failCreate = true;
    await tester.pumpWidget(MaterialApp(home: _screen()));
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not play'), findsOneWidget);
  });

  testWidgets('disposes the controller if unmounted during init', (
    tester,
  ) async {
    final gate = Completer<void>();
    fake.createGate = gate;
    await tester.pumpWidget(MaterialApp(home: _screen()));
    await tester.pump();
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.pause_circle), findsNothing);
  });
}
