import 'package:dufs_client/util/filter_sort.dart';
import 'package:flutter/material.dart';

/// Glyph + spoken label for each type filter (the label is never painted).
(IconData, String) typeGlyph(TypeFilter t) => switch (t) {
  TypeFilter.all => (Icons.apps, 'All types'),
  TypeFilter.folder => (Icons.folder, 'Folders'),
  TypeFilter.image => (Icons.image, 'Images'),
  TypeFilter.video => (Icons.movie, 'Videos'),
  TypeFilter.audio => (Icons.audiotrack, 'Audio'),
  TypeFilter.pdf => (Icons.picture_as_pdf, 'PDFs'),
  TypeFilter.text => (Icons.description, 'Text'),
  TypeFilter.other => (Icons.insert_drive_file, 'Other'),
};

/// Glyph + spoken label for each sort key.
(IconData, String) sortGlyph(SortKey k) => switch (k) {
  SortKey.name => (Icons.sort_by_alpha, 'Name'),
  SortKey.size => (Icons.sd_storage, 'Size'),
  SortKey.modified => (Icons.edit_calendar, 'Modified'),
  SortKey.created => (Icons.event, 'Created'),
  SortKey.uploaded => (Icons.cloud_upload, 'Uploaded'),
  SortKey.duration => (Icons.timer, 'Duration'),
  SortKey.resolution => (Icons.aspect_ratio, 'Resolution'),
  SortKey.type => (Icons.category, 'Type'),
  SortKey.extension => (Icons.extension, 'Extension'),
};

/// A dropdown row showing only the glyph of `(icon, spoken)`.
Widget glyphItem((IconData, String) glyph) =>
    Icon(glyph.$1, semanticLabel: glyph.$2);

/// A section glyph in front of [control] (replaces a worded row label).
Widget glyphRow(IconData icon, String spoken, Widget control) => Row(
  children: [
    SizedBox(width: 48, child: Icon(icon, semanticLabel: spoken)),
    Expanded(child: control),
  ],
);
