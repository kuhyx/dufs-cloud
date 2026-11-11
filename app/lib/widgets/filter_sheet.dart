import 'package:dufs_client/util/filter_sort.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:dufs_client/widgets/extension_picker.dart';
import 'package:dufs_client/widgets/filter_icons.dart';
import 'package:dufs_client/widgets/quantile_range_slider.dart';
import 'package:dufs_client/widgets/range_bounds_field.dart';
import 'package:flutter/material.dart';

String _megapixels(int pixels) => '${(pixels / 1000000).toStringAsFixed(1)} MP';

bool _hasRange(List<int> v) => v.length > 1 && v.first < v.last;

/// The filter/sort controls shown in a bottom sheet: type, tri-state extension
/// picker, quantile-scaled size and (for videos) duration sliders each paired
/// with typed min/max bounds, sort, and a Clear button — matching the controls
/// the web gallery exposes in `web/src/components/filter-bar.tsx`.
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
        // Lift the sheet above the on-screen keyboard: the typed bounds are
        // text fields, so the keyboard would otherwise cover the control being
        // edited. Scrollable for the same reason — with the keyboard up there
        // is not room for every control at once.
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              glyphRow(Icons.category, 'Type', _typeDropdown()),
              if (filter.type != TypeFilter.folder) ...[
                const SizedBox(height: 12),
                glyphRow(
                  Icons.extension,
                  'Extensions',
                  ExtensionPicker(
                  available: extensions,
                  includes: filter.extIncludes,
                  excludes: filter.extExcludes,
                  onChanged: (inc, exc) => onFilter(
                    filter.copyWith(extIncludes: inc, extExcludes: exc),
                  ),
                  ),
                ),
              ],
              if (_hasRange(sizeValues)) ...[
                const SizedBox(height: 12),
                const Icon(Icons.sd_storage, semanticLabel: 'Size'),
                QuantileRangeSlider(
                  values: sizeValues,
                  lo: filter.minSize,
                  hi: filter.maxSize,
                  labelOf: paths.humanSize,
                  onChanged: (lo, hi) =>
                      onFilter(filter.copyWith(minSize: lo, maxSize: hi)),
                ),
                const SizedBox(height: 8),
                RangeBoundsField(
                  lo: filter.minSize,
                  hi: filter.maxSize,
                  perUnit: bytesPerMb,
                  unit: 'MB',
                  onChanged: (lo, hi) =>
                      onFilter(filter.copyWith(minSize: lo, maxSize: hi)),
                ),
              ],
              if (filter.type == TypeFilter.video &&
                  _hasRange(durationValues)) ...[
                const SizedBox(height: 12),
                const Icon(Icons.timer, semanticLabel: 'Length'),
                QuantileRangeSlider(
                  values: durationValues,
                  lo: filter.minDurationMs,
                  hi: filter.maxDurationMs,
                  labelOf: paths.formatDuration,
                  onChanged: (lo, hi) => onFilter(
                    filter.copyWith(minDurationMs: lo, maxDurationMs: hi),
                  ),
                ),
                const SizedBox(height: 8),
                RangeBoundsField(
                  lo: filter.minDurationMs,
                  hi: filter.maxDurationMs,
                  perUnit: 1000,
                  unit: 's',
                  decimals: 0,
                  onChanged: (lo, hi) => onFilter(
                    filter.copyWith(minDurationMs: lo, maxDurationMs: hi),
                  ),
                ),
              ],
              if ((filter.type == TypeFilter.image ||
                      filter.type == TypeFilter.video) &&
                  _hasRange(resolutionValues)) ...[
                const SizedBox(height: 12),
                const Icon(Icons.aspect_ratio, semanticLabel: 'Resolution'),
                QuantileRangeSlider(
                  values: resolutionValues,
                  lo: filter.minPixels,
                  hi: filter.maxPixels,
                  labelOf: _megapixels,
                  onChanged: (lo, hi) =>
                      onFilter(filter.copyWith(minPixels: lo, maxPixels: hi)),
                ),
                const SizedBox(height: 8),
                RangeBoundsField(
                  lo: filter.minPixels,
                  hi: filter.maxPixels,
                  perUnit: pixelsPerMp,
                  unit: 'MP',
                  onChanged: (lo, hi) =>
                      onFilter(filter.copyWith(minPixels: lo, maxPixels: hi)),
                ),
              ],
              const SizedBox(height: 12),
              glyphRow(Icons.sort, 'Sort', _sortControls()),
              if (isFilterActive(filter)) ...[
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: IconButton.filledTonal(
                    onPressed: () => onFilter(defaultFilter),
                    icon: const Icon(
                      Icons.filter_alt_off,
                      semanticLabel: 'Clear',
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _typeDropdown() => DropdownButton<TypeFilter>(
        isExpanded: true,
        value: filter.type,
        onChanged: (t) {
          if (t != null) onFilter(filter.copyWith(type: t));
        },
        items: [
          for (final t in TypeFilter.values)
            DropdownMenuItem(value: t, child: glyphItem(typeGlyph(t))),
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
                  DropdownMenuItem(value: k, child: glyphItem(sortGlyph(k))),
              ],
            ),
          ),
          IconButton(
            icon: Icon(
              sort.dir == SortDir.asc
                  ? Icons.arrow_upward
                  : Icons.arrow_downward,
              semanticLabel:
                  sort.dir == SortDir.asc ? 'Ascending' : 'Descending',
            ),
            onPressed: () => onSort(
              sort.copyWith(
                dir: sort.dir == SortDir.asc ? SortDir.desc : SortDir.asc,
              ),
            ),
          ),
        ],
      );
}
