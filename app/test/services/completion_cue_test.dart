import 'package:dufs_client/services/completion_cue.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late DateTime clock;
  late int played;
  var enabled = true;

  CompletionCue makeCue() => CompletionCue(
    enabled: () => enabled,
    play: () async => played++,
    now: () => clock,
  );

  setUp(() {
    clock = DateTime(2026);
    played = 0;
    enabled = true;
  });

  test('plays when enabled and the operation took at least 2 s', () async {
    final run = makeCue().begin();
    clock = clock.add(const Duration(seconds: 2));
    await run.succeeded();
    expect(played, 1);
  });

  test('stays silent under 2 s', () async {
    final run = makeCue().begin();
    clock = clock.add(const Duration(milliseconds: 1999));
    await run.succeeded();
    expect(played, 0);
  });

  test('stays silent when disabled', () async {
    enabled = false;
    final run = makeCue().begin();
    clock = clock.add(const Duration(seconds: 30));
    await run.succeeded();
    expect(played, 0);
  });

  test('reads the toggle at finish time, not at start', () async {
    final run = makeCue().begin();
    enabled = false;
    clock = clock.add(const Duration(seconds: 30));
    await run.succeeded();
    expect(played, 0);
  });

  test('cancel or error never reaches succeeded, so nothing plays', () {
    makeCue().begin(); // abandoned: caller hit a cancel or error path
    clock = clock.add(const Duration(minutes: 5));
    expect(played, 0);
  });

  test('a run can only cue once', () async {
    final run = makeCue().begin();
    clock = clock.add(const Duration(seconds: 5));
    await run.succeeded();
    await run.succeeded();
    expect(played, 1);
  });

  test('a failing player never throws into the caller', () async {
    final cue = CompletionCue(
      enabled: () => true,
      play: () async => throw PlatformException(code: 'x'),
      now: () => clock,
    );
    final run = cue.begin();
    clock = clock.add(const Duration(seconds: 5));
    await run.succeeded();
  });

  Future<void> finishLongRun() async {
    final run = CompletionCue(enabled: () => true, now: () => clock).begin();
    clock = clock.add(const Duration(seconds: 5));
    await run.succeeded();
  }

  test('default player calls the platform channel', () async {
    final calls = <String>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const channel = MethodChannel('com.kuhy.dufs_client/completion');
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      return null;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
    await finishLongRun();
    expect(calls, ['playCompletionCue']);
  });

  test('default player tolerates a missing platform side', finishLongRun);
}
