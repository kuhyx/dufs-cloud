import 'package:dufs_client/widgets/cue.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The glyph whose spoken (screen-reader) label is exactly [label]: the
/// text-free UI keeps the old wording there, never on screen.
Finder spoken(String label) => find.byWidgetPredicate(
  (w) => w is Icon && w.semanticLabel == label,
  description: 'glyph spoken as "$label"',
);

/// A glyph whose spoken label contains [part].
Finder spokenContaining(String part) => find.byWidgetPredicate(
  (w) => w is Icon && (w.semanticLabel?.contains(part) ?? false),
  description: 'glyph spoken containing "$part"',
);

/// The status cue of [kind] (snackbars, error states).
Finder cueOf(CueKind kind) => find.byWidgetPredicate(
  (w) => w is CueGlyph && w.kind == kind,
  description: 'cue $kind',
);

/// The text field wrapped in a `Semantics` labelled [label] (fields are named
/// by a prefix glyph; the old label is spoken only), e.g. `'min MB'`.
Finder fieldSpoken(String label) => find.descendant(
  of: find.byWidgetPredicate(
    (w) => w is Semantics && w.properties.label == label,
    description: 'field spoken as "$label"',
  ),
  matching: find.byType(TextField),
);
