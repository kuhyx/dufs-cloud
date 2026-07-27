import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Bytes in a megabyte, matching `BYTES_PER_MB` in the web
/// `size-range.tsx`.
const int bytesPerMb = 1024 * 1024;

/// Pixels in a megapixel, matching `PIXELS_PER_MP` in `resolution-range.tsx`.
const int pixelsPerMp = 1000000;

/// Formats [value] into the field's display unit, rounded to [decimals] places
/// so dragging the slider does not spray long floats into the box.
///
/// Mirrors `mbValue`/`secValue`/`mpValue` on the web side; null (no bound)
/// renders as an empty field.
String formatBound(int? value, num perUnit, {int decimals = 1}) {
  if (value == null) return '';
  final scaled = value / perUnit;
  final rounded = decimals == 0
      ? scaled.roundToDouble()
      : (scaled * 10).roundToDouble() / 10;
  // Drop a trailing ".0" so the common case reads "500", not "500.0".
  return rounded == rounded.roundToDouble()
      ? rounded.toInt().toString()
      : rounded.toString();
}

/// Parses [text] in display units back to the underlying unit.
///
/// Returns null both for a cleared field and for junk, which is the same
/// "no bound" the slider reports when a thumb sits at an extreme — see
/// `bytesFromMb`/`msFromSec`/`pixelsFromMp` on the web side.
int? parseBound(String text, num perUnit) {
  final trimmed = text.trim();
  if (trimmed.isEmpty) return null;
  final parsed = double.tryParse(trimmed);
  if (parsed == null || parsed < 0) return null;
  return (parsed * perUnit).round();
}

/// A min/max pair of numeric text fields for one filter range.
///
/// Sits beside the range slider so a bound can be typed exactly instead of
/// dragged — the browser gallery has always had this and the phone did not.
/// Empty means "no bound", matching both the slider (a thumb at an extreme
/// reports null) and `FilterState`'s nullable bounds.
class RangeBoundsField extends StatefulWidget {
  /// Creates the pair for the range [lo] – [hi].
  const RangeBoundsField({
    required this.lo,
    required this.hi,
    required this.perUnit,
    required this.unit,
    required this.onChanged,
    this.decimals = 1,
    super.key,
  });

  /// Current lower bound in the underlying unit, or null when unset.
  final int? lo;

  /// Current upper bound in the underlying unit, or null when unset.
  final int? hi;

  /// How many underlying units make up one display unit (e.g. bytes per MB).
  final num perUnit;

  /// Display unit shown as the field suffix ("MB", "s", "MP").
  final String unit;

  /// Decimal places kept when formatting.
  final int decimals;

  /// Reports edited bounds; either side may be null.
  final void Function(int? lo, int? hi) onChanged;

  @override
  State<RangeBoundsField> createState() => _RangeBoundsFieldState();
}

class _RangeBoundsFieldState extends State<RangeBoundsField> {
  late final TextEditingController _lo;
  late final TextEditingController _hi;

  @override
  void initState() {
    super.initState();
    _lo = TextEditingController(text: _fmt(widget.lo));
    _hi = TextEditingController(text: _fmt(widget.hi));
  }

  String _fmt(int? v) =>
      formatBound(v, widget.perUnit, decimals: widget.decimals);

  @override
  void didUpdateWidget(RangeBoundsField old) {
    super.didUpdateWidget(old);
    // Keep the fields in step when the bound changes elsewhere (the slider, or
    // the Clear button) without fighting an edit in progress.
    _sync(_lo, widget.lo);
    _sync(_hi, widget.hi);
  }

  void _sync(TextEditingController c, int? value) {
    // Never rewrite text that already *means* [value]. The parent echoes every
    // keystroke straight back, and mid-edit the box legitimately holds things
    // like "1." or "1.55" whose reformatting ("1", "1.6") is not what the user
    // typed. Overwriting there ate the decimal point and left the caret after
    // the "1", so the next digit landed in the wrong column — typing "1.5"
    // produced a 15 MB bound.
    if (parseBound(c.text, widget.perUnit) == value) return;
    final text = _fmt(value);
    if (c.text != text) c.text = text;
  }

  @override
  void dispose() {
    _lo.dispose();
    _hi.dispose();
    super.dispose();
  }

  void _emit() => widget.onChanged(
        parseBound(_lo.text, widget.perUnit),
        parseBound(_hi.text, widget.perUnit),
      );

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(child: _field(_lo, 'min')),
          const SizedBox(width: 12),
          Expanded(child: _field(_hi, 'max')),
        ],
      );

  Widget _field(TextEditingController controller, String label) => TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp('[0-9.]')),
        ],
        decoration: InputDecoration(
          labelText: '$label ${widget.unit}',
          isDense: true,
          border: const OutlineInputBorder(),
        ),
        onChanged: (_) => _emit(),
      );
}
