import 'dart:async';

import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/screens/browser/browser_fields.dart';
import 'package:flutter/services.dart';

/// Multi-select state changes: enter, toggle, range and exit.
mixin BrowserSelection on BrowserFields {
  /// Long-press enters multi-select with the pressed entry already selected.
  void enterSelect(DirEntry entry) {
    unawaited(HapticFeedback.selectionClick());
    setState(() {
      selecting = true;
      selectAnchor = entry.path;
      selected
        ..clear()
        ..add(entry.path);
    });
  }

  /// A plain tap toggles just this entry and moves the anchor here; an armed
  /// range-select tap instead selects every entry between the anchor and
  /// this one (inclusive, in the current listing's order) and disarms.
  void toggleSelect(DirEntry entry) {
    setState(() {
      final anchor = selectAnchor;
      if (rangeArmed && anchor != null) {
        final anchorIdx = listing.indexWhere((e) => e.path == anchor);
        final targetIdx = listing.indexWhere((e) => e.path == entry.path);
        // A pull-to-refresh during select mode can drop the anchor from the
        // listing without clearing the selection; fall back to a plain
        // toggle rather than extending from an index we no longer have.
        if (anchorIdx != -1 && targetIdx != -1) {
          final lo = anchorIdx < targetIdx ? anchorIdx : targetIdx;
          final hi = anchorIdx < targetIdx ? targetIdx : anchorIdx;
          for (final e in listing.sublist(lo, hi + 1)) {
            selected.add(e.path);
          }
          selectAnchor = entry.path;
          rangeArmed = false;
          return;
        }
      }
      if (!selected.remove(entry.path)) selected.add(entry.path);
      selectAnchor = entry.path;
      rangeArmed = false;
    });
  }

  /// Arms or disarms range select.
  void toggleRangeArmed() {
    setState(() => rangeArmed = !rangeArmed);
  }

  /// Leaves multi-select and clears the selection.
  void exitSelect() {
    setState(() {
      selecting = false;
      selected.clear();
      selectAnchor = null;
      rangeArmed = false;
    });
  }
}
