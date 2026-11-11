/// The app's design tokens: one identical palette shared across every one
/// of kuhy's apps (Flutter, web, Python/Tkinter alike) — see the
/// `unified-design-system` skill (`~/.claude/skills/unified-design-system/`)
/// for the frozen token table this file implements. Built from explicit
/// `ColorScheme.dark`/`.light`, not `ColorScheme.fromSeed`, because the
/// shared palette is hand-picked, not algorithmically derived from one seed
/// color. Unlike most of kuhy's apps, this one ships both brightnesses (it
/// already did before this file existed), so both variants are built here.
library;

import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';

/// Builds the app's `ThemeData` for [brightness] from the shared token set.
ThemeData buildAppTheme(Brightness brightness) {
  final colorScheme = brightness == Brightness.dark
      ? const ColorScheme.dark(
          surface: AppPalette.ink,
          surfaceContainerHighest: AppPalette.inkRaised2,
          surfaceContainerHigh: AppPalette.inkRaised1,
          onSurface: AppPalette.textOnDark,
          onSurfaceVariant: AppPalette.mutedOnDark,
          outline: AppPalette.lineDark,
          primary: AppPalette.accent,
          onPrimary: AppPalette.onFill,
          secondary: AppPalette.accent,
          onSecondary: AppPalette.onFill,
          secondaryContainer: AppPalette.lineDark,
          onSecondaryContainer: AppPalette.accent,
          tertiary: AppPalette.accent,
          onTertiary: AppPalette.onFill,
          tertiaryContainer: AppPalette.lineDark,
          onTertiaryContainer: AppPalette.accent,
          error: AppPalette.danger,
          onError: AppPalette.onFill,
        )
      : const ColorScheme.light(
          surface: AppPalette.paper,
          surfaceContainerHighest: AppPalette.paperRaised,
          surfaceContainerHigh: AppPalette.paperRaised,
          onSurface: AppPalette.textOnLight,
          onSurfaceVariant: AppPalette.mutedOnLight,
          outline: AppPalette.lineLight,
          primary: AppPalette.accent,
          onPrimary: AppPalette.onFill,
          secondary: AppPalette.accent,
          onSecondary: AppPalette.onFill,
          secondaryContainer: AppPalette.lineLight,
          onSecondaryContainer: AppPalette.accent,
          tertiary: AppPalette.accent,
          onTertiary: AppPalette.onFill,
          tertiaryContainer: AppPalette.lineLight,
          onTertiaryContainer: AppPalette.accent,
          error: AppPalette.danger,
          onError: AppPalette.onFill,
        );
  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: colorScheme.surface,
    textTheme: const TextTheme(
      bodyLarge: TextStyle(fontSize: AppTextSize.body),
      bodyMedium: TextStyle(fontSize: AppTextSize.body),
      titleLarge: TextStyle(fontSize: AppTextSize.title),
      titleMedium: TextStyle(fontSize: AppTextSize.subtitle),
      labelMedium: TextStyle(fontSize: AppTextSize.label),
      labelSmall: TextStyle(fontSize: AppTextSize.caption),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: colorScheme.surfaceContainerHigh,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.sm),
        borderSide: BorderSide(color: colorScheme.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.sm),
        borderSide: BorderSide(color: colorScheme.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.sm),
        borderSide: BorderSide(color: colorScheme.primary, width: 2),
      ),
      labelStyle: TextStyle(color: colorScheme.onSurfaceVariant),
    ),
    dividerTheme: DividerThemeData(
      color: colorScheme.outline,
      thickness: 1,
      space: AppSpacing.md,
    ),
  );
}

/// Fixed dark tokens for surfaces that stay near-black regardless of the
/// app's own light/dark theme — the full-screen image/video viewers, by the
/// same convention as every photo/video app (Google Photos, iOS Photos):
/// media chrome is always dark so it doesn't compete with the media itself.
/// This is the same "scrim" precedent as `tokens.md`'s on-scrim role (fixed
/// near-white text on a fixed dark backdrop, regardless of page theme) —
/// just applied to a full surface instead of a translucent overlay.
abstract final class AppViewerColors {
  /// `ink` — near-black, not pure `Colors.black`.
  static const Color background = AppPalette.ink;

  /// `text-on-dark` — near-white, not pure `Colors.white`.
  static const Color foreground = AppPalette.textOnDark;

  /// `muted-on-dark`, for de-emphasized chrome (error text, disabled icons).
  static const Color muted = AppPalette.mutedOnDark;
}

/// `MaterialApp.builder` that never paints tooltips. Framework widgets
/// (BackButton, PopupMenuButton) add worded tooltips on long-press; the
/// textgate rule allows no visible chrome words, while semantics keep them.
Widget hideTooltips(BuildContext context, Widget? child) =>
    TooltipVisibility(visible: false, child: child ?? const SizedBox.shrink());
