import 'dart:async';

import 'package:chewie/chewie.dart';
import 'package:dufs_client/screens/video_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player/video_player.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'support/fake_video_platform.dart';

DufsClient _client() =>
    DufsClient(baseUrl: 'https://host', username: 'u', password: 'p');

VideoScreen _screen() => VideoScreen(
      client: _client(),
      path: '/clip.mp4',
      title: 'clip.mp4',
      controllerFactory: VideoPlayerController.networkUrl,
    );

void main() {
  late FakeVideoPlayerPlatform fake;

  setUp(() {
    fake = FakeVideoPlayerPlatform();
    VideoPlayerPlatform.instance = fake;
  });

  testWidgets('shows a spinner then the Chewie player once initialized',
      (tester) async {
    await tester.pumpWidget(MaterialApp(home: _screen()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    // Chewie runs a periodic position timer, so pumpAndSettle would never
    // settle; pump explicitly until the player initializes and rebuilds.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(Chewie), findsOneWidget);
    expect(find.text('clip.mp4'), findsOneWidget);
  });

  testWidgets('shows an error message when the controller fails',
      (tester) async {
    fake.failCreate = true;
    await tester.pumpWidget(MaterialApp(home: _screen()));
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not play'), findsOneWidget);
  });

  testWidgets('disposes the controller if unmounted during init',
      (tester) async {
    final gate = Completer<void>();
    fake.createGate = gate;
    await tester.pumpWidget(MaterialApp(home: _screen()));
    await tester.pump(); // _init starts and blocks on the gate
    // Unmount while create() is still pending, then let it finish.
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.byType(Chewie), findsNothing);
  });
}
