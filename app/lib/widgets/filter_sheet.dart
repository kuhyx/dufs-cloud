import 'package:dufs_client/util/filter_sort.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:dufs_client/widgets/extension_picker.dart';
import 'package:dufs_client/widgets/quantile_range_slider.dart';
import 'package:flutter/material.dart';

String _typeLabel(TypeFilter t) => switch (t) {
      TypeFilter.all => 'All types',
      TypeFilter.folder => 'Folders',
      TypeFilter.image => 'Images',
      TypeFilter.video => 'Videos',
      TypeFilter.text => 'Text',
      TypeFilter.other => 'Other',
    };

String _sortLabel(SortKey k) => switch (k) {
      SortKey.name => 'Name',
      SortKey.size => 'Size',
      SortKey.modified => 'Modified',
      SortKey.created => 'Created',
      SortKey.uploaded => 'Uploaded',
      SortKey.duration => 'Duration',
      SortKey.resolution => 'Resolution',
      SortKey.type => 'Type',
      SortKey.extension => 'Extension',
    };

String _megapixels(int pixels) => '${(pixels / 1000000).toStringAsFixed(1)} MP';

bool _hasRange(List<int> v) => v.length > 1 && v.first < v.last;

/// The filter/sort controls shown in a bottom sheet: type, tri-state extension
/// picker, quantile-scaled size and (for videos) duration sliders, and sort.
/// Fully controlled — every edit is reported through [onFilter]/[onSort] so the
/// parent owns the single source of truth that feeds `applyFilterSort`.
class FilterSheet extends StatelessWidget {
  /// Creates the sheet from the current [filter]/[sort] and in-scope stats.
  const FilterSheet({
    required this.filter,
    required this.sort,
    required this.extensions,
    required this.sizeValues,
    required this.durationValues,
    required this.resolutionValues,
    required this.onFilter,
    required this.onSort,
    super.key,
  });

  /// The active filter.
  final FilterState filter;

  /// The active sort.
  final SortState sort;

  /// Extensions available in scope (for the picker).
  final List<String> extensions;

  /// Ascending file sizes in scope (for the size slider).
  final List<int> sizeValues;

  /// Ascending video durations (ms) in scope (for the duration slider).
  final List<int> durationValues;

  /// Ascending resolutions (total pixels) in scope (for the resolution slider).
  final List<int> resolutionValues;

  /// Reports a filter edit.
  final void Function(FilterState) onFilter;

  /// Reports a sort edit.
  final void Function(SortState) onSort;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _row('Type', _typeDropdown()),
            if (filter.type != TypeFilter.folder) ...[
              const SizedBox(height: 12),
              const Text('Extensions'),
              const SizedBox(height: 4),
              ExtensionPicker(
                available: extensions,
                includes: filter.extIncludes,
                excludes: filter.extExcludes,
                onChanged: (inc, exc) => onFilter(
                  filter.copyWith(extIncludes: inc, extExcludes: exc),
                ),
              ),
            ],
            if (_hasRange(sizeValues)) ...[
              const SizedBox(height: 12),
              const Text('Size'),
              QuantileRangeSlider(
                values: sizeValues,
                lo: filter.minSize,
                hi: filter.maxSize,
                labelOf: paths.humanSize,
                onChanged: (lo, hi) =>
                    onFilter(filter.copyWith(minSize: lo, maxSize: hi)),
              ),
            ],
            if (filter.type == TypeFilter.video &&
                _hasRange(durationValues)) ...[
              const SizedBox(height: 12),
              const Text('Length'),
              QuantileRangeSlider(
                values: durationValues,
                lo: filter.minDurationMs,
                hi: filter.maxDurationMs,
                labelOf: paths.formatDuration,
                onChanged: (lo, hi) => onFilter(
                  filter.copyWith(minDurationMs: lo, maxDurationMs: hi),
                ),
              ),
            ],
            if ((filter.type == TypeFilter.image ||
                    filter.type == TypeFilter.video) &&
                _hasRange(resolutionValues)) ...[
              const SizedBox(height: 12),
              const Text('Resolution'),
              QuantileRangeSlider(
                values: resolutionValues,
                lo: filter.minPixels,
                hi: filter.maxPixels,
                labelOf: _megapixels,
                onChanged: (lo, hi) =>
                    onFilter(filter.copyWith(minPixels: lo, maxPixels: hi)),
              ),
            ],
            const SizedBox(height: 12),
            _row('Sort', _sortControls()),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, Widget control) => Row(
        children: [
          SizedBox(width: 72, child: Text(label)),
          Expanded(child: control),
        ],
      );

  Widget _typeDropdown() => DropdownButton<TypeFilter>(
        isExpanded: true,
        value: filter.type,
        onChanged: (t) {
          if (t != null) onFilter(filter.copyWith(type: t));
        },
        items: [
          for (final t in TypeFilter.values)
            DropdownMenuItem(value: t, child: Text(_typeLabel(t))),
        ],
      );

  Widget _sortControls() => Row(
        children: [
          Expanded(
            child: DropdownButton<SortKey>(
              isExpanded: true,
              value: sort.key,
              onChanged: (k) {
                if (k != null) onSort(sort.copyWith(key: k));
              },
              items: [
                for (final k in SortKey.values)
                  DropdownMenuItem(value: k, child: Text(_sortLabel(k))),
              ],
            ),
          ),
          IconButton(
            tooltip: sort.dir == SortDir.asc ? 'Ascending' : 'Descending',
            icon: Icon(sort.dir == SortDir.asc
                ? Icons.arrow_upward
                : Icons.arrow_downward),
            onPressed: () => onSort(
              sort.copyWith(
                dir: sort.dir == SortDir.asc ? SortDir.desc : SortDir.asc,
              ),
            ),
          ),
        ],
      );
}
