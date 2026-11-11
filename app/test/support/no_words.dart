import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Two or more letters in a row: a word. Numbers, a number's unit symbol
/// ("12 KB", see `_measure`) and other symbols are not words.
final _word = RegExp('[A-Za-z]{2,}');

/// A number with its unit symbol ("12 KB", "1.5 MP", "3 min"): content.
final _measure = RegExp(r'\d+(\.\d+)?\s?(B|KB|MB|GB|TB|MP|s|min|h)\b');

bool _hasWord(String s) => _word.hasMatch(s.replaceAll(_measure, ''));

/// Every painted string on screen: `Text`/`RichText` data plus tooltip
/// messages (painted on long-press) and input hints/labels.
List<String> paintedStrings(WidgetTester tester) {
  final out = <String>[];
  for (final w in tester.widgetList<RichText>(find.byType(RichText))) {
    out.add(w.text.toPlainText());
  }
  for (final e in find.byType(Tooltip).evaluate()) {
    // A tooltip under TooltipVisibility(false) never paints.
    if (!TooltipVisibility.of(e)) continue;
    final m = (e.widget as Tooltip).message;
    if (m != null && m.isNotEmpty) out.add(m);
  }
  for (final w in tester.widgetList<InputDecorator>(
    find.byType(InputDecorator),
  )) {
    final d = w.decoration;
    for (final s in [
      d.hintText,
      d.labelText,
      d.helperText,
      d.errorText,
      d.prefixText,
      d.suffixText,
    ]) {
      if (s != null && s.isNotEmpty) out.add(s);
    }
  }
  return out;
}

/// Fails when any painted string holds a word, unless it is exactly one of
/// the [content] strings (file names, typed values: user data, not chrome).
void expectNoWords(WidgetTester tester, {Set<String> content = const {}}) {
  final offenders = paintedStrings(
    tester,
  ).where((s) => !content.contains(s) && _hasWord(s)).toList();
  expect(offenders, isEmpty, reason: 'chrome words on screen');
}
