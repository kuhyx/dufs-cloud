import 'package:dufs_client/ui/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Pins the app theme to the frozen palette's literal values, so swapping the
/// hand-copied hexes for `design_system` tokens cannot change a colour.
void main() {
  test('dark scheme keeps the frozen palette values', () {
    final s = buildAppTheme(Brightness.dark).colorScheme;
    expect(s.surface, const Color(0xFF211D1B));
    expect(s.surfaceContainerHighest, const Color(0xFF38312E));
    expect(s.surfaceContainerHigh, const Color(0xFF2B2624));
    expect(s.onSurface, const Color(0xFFECEAE9));
    expect(s.onSurfaceVariant, const Color(0xFFAAA09A));
    expect(s.outline, const Color(0xFF463E3A));
    expect(s.primary, const Color(0xFFB8862E));
    expect(s.onPrimary, const Color(0xFF211D1B));
    expect(s.secondary, const Color(0xFFB8862E));
    expect(s.secondaryContainer, const Color(0xFF463E3A));
    expect(s.onSecondaryContainer, const Color(0xFFB8862E));
    expect(s.tertiaryContainer, const Color(0xFF463E3A));
    expect(s.error, const Color(0xFFE2585F));
    expect(s.onError, const Color(0xFF211D1B));
  });

  test('light scheme keeps the frozen palette values', () {
    final s = buildAppTheme(Brightness.light).colorScheme;
    expect(s.surface, const Color(0xFFF6F4F3));
    expect(s.surfaceContainerHighest, const Color(0xFFFCFBFB));
    expect(s.surfaceContainerHigh, const Color(0xFFFCFBFB));
    expect(s.onSurface, const Color(0xFF211D1B));
    expect(s.onSurfaceVariant, const Color(0xFF70625B));
    expect(s.outline, const Color(0xFFE0DAD7));
    expect(s.primary, const Color(0xFFB8862E));
    expect(s.secondaryContainer, const Color(0xFFE0DAD7));
    expect(s.tertiaryContainer, const Color(0xFFE0DAD7));
    expect(s.error, const Color(0xFFE2585F));
  });

  test('viewer colours keep their literal values', () {
    expect(AppViewerColors.background, const Color(0xFF211D1B));
    expect(AppViewerColors.foreground, const Color(0xFFECEAE9));
    expect(AppViewerColors.muted, const Color(0xFFAAA09A));
  });
}
