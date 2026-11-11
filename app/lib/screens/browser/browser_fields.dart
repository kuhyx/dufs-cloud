import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/screens/browser_screen.dart';
import 'package:dufs_client/services/cloud_index.dart';
import 'package:dufs_client/services/completion_cue.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/util/cloud_stats.dart';
import 'package:dufs_client/util/filter_sort.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:dufs_client/widgets/cue.dart';
import 'package:flutter/material.dart';

/// State of the browser screen plus the values derived from it. The other
/// browser mixins build on this one.
mixin BrowserFields on State<BrowserScreen> {
  /// The dufs client; null until the settings are configured.
  DufsClient? dufsClient;

  /// Plays the completion cue after a long operation succeeds.
  late final CompletionCue cue =
      widget.completionCue ??
      CompletionCue(enabled: () => widget.settings.completionSound);

  /// The folder being shown.
  String currentPath = '/';

  /// The current folder's entries.
  List<DirEntry> listing = <DirEntry>[];

  /// True while a folder listing is loading.
  bool loading = true;

  /// The listing error to show instead of the grid.
  String? loadError;

  /// True while a mutation or transfer blocks further actions.
  bool busy = false;

  /// The in-flight upload/download batch shown in the banner.
  TransferProgress? transfer;

  /// Cancel flag shared with every streaming loop of the batch.
  TransferCancel? transferCancel;

  /// The server's media metadata index.
  MetaIndex metaIndex = <String, MediaMeta>{};

  /// The active filter.
  FilterState filter = defaultFilter;

  /// The active sort.
  SortState sort = defaultSort;

  /// The app-bar search box.
  final TextEditingController search = TextEditingController();

  /// Whole-cloud index for scoped global filtering: built lazily on first
  /// filter use, cached, invalidated (set null) on mutations.
  List<DirEntry>? cloudIndex;

  /// True while the index walk runs.
  bool indexing = false;

  /// Live counts of the index walk.
  IndexProgress indexProgress = IndexProgress.none;

  /// Cancel switch of the index walk.
  TransferCancel? indexCancel;

  /// Whether the last walk was cancelled (so [cloudIndex] holds only what was
  /// found).
  bool indexPartial = false;

  /// Search-result folders whose tiles are hidden.
  final Set<String> collapsed = <String>{};

  /// Multi-select mode (long-press to enter). Scoped to the current folder's
  /// grid only: bulk move/zip assume every selection is a direct child of
  /// [currentPath], which the whole-cloud filter view would violate.
  bool selecting = false;

  /// Paths of the selected entries.
  final Set<String> selected = <String>{};

  /// Last item tapped without range mode armed: the range-select anchor
  /// (touch's equivalent of shift-click's "last item clicked").
  String? selectAnchor;

  /// Armed by the "Range select" action bar button; the next tap extends
  /// the selection from the anchor to that item, inclusive, then disarms.
  bool rangeArmed = false;

  /// The parent of [currentPath].
  String get parentPath {
    if (currentPath == '/') return '/';
    final cut = currentPath.substring(0, currentPath.lastIndexOf('/'));
    return cut.isEmpty ? '/' : cut;
  }

  /// The cloud index restricted to the current folder's subtree.
  List<DirEntry> get scoped => (cloudIndex ?? const <DirEntry>[])
      .where((e) => paths.underPath(e.path, currentPath))
      .toList();

  /// Whether any filter is set.
  bool get filterActive => isFilterActive(filter);

  /// Global search mode: an active filter, once the index is built.
  bool get globalMode => filterActive && cloudIndex != null;

  /// The filtered, sorted search results grouped by folder.
  List<FolderGroup> get groups {
    if (!globalMode) return const [];
    final wantFolders = filter.type == TypeFilter.folder;
    final pool = scoped.where((e) => wantFolders ? e.isDir : !e.isDir).toList();
    return groupByFolder(applyFilterSort(pool, metaIndex, filter, sort));
  }

  /// The current-folder entries whose paths are selected.
  List<DirEntry> get selectedEntries =>
      listing.where((e) => selected.contains(e.path)).toList();

  /// System back (gesture or button) peels one layer per press: selection,
  /// then an active filter, then one folder up; only at a bare root does the
  /// app exit.
  bool get canExit => !selecting && !filterActive && currentPath == '/';

  /// Shows a [kind] glyph in a snackbar while the screen is mounted;
  /// [spoken] is for screen readers, [detail] is content (names, counts).
  void snack(
    CueKind kind,
    String spoken, {
    String? detail,
    Widget? action,
    Duration duration = const Duration(seconds: 4),
  }) {
    if (!mounted) return;
    showCue(
      context,
      kind,
      spoken: spoken,
      detail: detail,
      action: action,
      duration: duration,
    );
  }
}
