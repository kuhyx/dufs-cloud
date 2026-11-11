import 'dart:async';

import 'package:design_system/design_system.dart';
import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/screens/browser/browser_opener.dart';
import 'package:dufs_client/util/cloud_stats.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:dufs_client/widgets/cue.dart';
import 'package:dufs_client/widgets/entry_tile.dart';
import 'package:dufs_client/widgets/folder_group_list.dart';
import 'package:dufs_client/widgets/indexing_view.dart';
import 'package:dufs_client/widgets/listing_skeleton.dart';
import 'package:flutter/material.dart';

// Height under each preview square for the name and size lines (16px + 12px
// text plus the tile's padding).
const double _tileLabelHeight = 52;

/// The screen body: the folder grid, search results and their tiles.
mixin BrowserBody on BrowserOpener {
  /// The body for the current loading, error, filter or folder state.
  Widget buildBody() {
    if (loading) return const ListingSkeleton();
    if (loadError != null) {
      // Not configured yet: one big gear that opens settings. Otherwise an
      // error glyph with a retry; the message stays spoken-only.
      if (!widget.settings.isConfigured) {
        return Center(
          child: IconButton.filledTonal(
            key: const Key('setup'),
            iconSize: 48,
            icon: Icon(Icons.settings, semanticLabel: loadError),
            onPressed: openSettings,
          ),
        );
      }
      return ErrorState(
        spoken: loadError!,
        onRetry: () => unawaited(load(currentPath)),
      );
    }
    if (filterActive) {
      if (cloudIndex == null) {
        return IndexingView(
          progress: indexProgress,
          onCancel: indexCancel?.cancel,
        );
      }
      final found = groups;
      if (found.isEmpty) {
        return Center(
          child: Icon(
            Icons.filter_alt_off,
            size: 64,
            color: Theme.of(context).colorScheme.outline,
            semanticLabel: 'Nothing matches your filters',
          ),
        );
      }
      if (!indexPartial) return buildGroups(found);
      return Column(
        children: [
          Semantics(
            label: 'Partial index',
            child: const Icon(Icons.warning_amber_outlined),
          ),
          Expanded(child: buildGroups(found)),
        ],
      );
    }
    if (listing.isEmpty) {
      return Center(
        child: Icon(
          Icons.folder_open,
          size: 64,
          color: Theme.of(context).colorScheme.outline,
          semanticLabel: 'This folder is empty',
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => load(currentPath),
      child: fitGrid(listing),
    );
  }

  /// The search results under collapsible folder headers.
  Widget buildGroups(List<FolderGroup> found) {
    return FolderGroupList(
      groups: found,
      collapsed: collapsed,
      onToggle: (folder) => setState(() {
        if (!collapsed.remove(folder)) collapsed.add(folder);
      }),
      groupGrid: groupGrid,
    );
  }

  /// One entry's tile, with the select-mode gestures when [selectable].
  Widget entryTile(DirEntry entry, {required bool selectable}) {
    // While selecting, a tap toggles the item instead of opening it.
    final tile = EntryTile(
      client: dufsClient!,
      entry: entry,
      onTap: () => selectable && selecting
          ? toggleSelect(entry)
          : unawaited(open(entry)),
      // Long-press enters select mode; once selecting it starts a drag
      // instead, so the two gestures never compete for the same press.
      onLongPress: selectable && !selecting ? () => enterSelect(entry) : null,
      selected: selectable && selecting ? selected.contains(entry.path) : null,
      onToggleSelect: selectable ? () => toggleSelect(entry) : null,
      onDownload: entry.isDir ? null : () => unawaited(download(entry)),
      onRename: () => unawaited(rename(entry)),
      onDelete: () => unawaited(delete(entry)),
    );
    if (!selectable || !selecting) return tile;
    return draggableTile(entry, tile);
  }

  /// The folder view: a fixed 3-column grid that always fits the screen, the
  /// overflow on horizontal pages. Wrapped so pull-to-refresh still has a
  /// vertical scrollable to overscroll (it has nothing to scroll: it is
  /// exactly as tall as the screen).
  Widget fitGrid(List<DirEntry> entries) {
    return LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: SizedBox(
          height: box.maxHeight,
          child: FitGrid(
            itemCount: entries.length,
            itemBuilder: (context, i) =>
                entryTile(entries[i], selectable: true),
            labelHeight: _tileLabelHeight,
            minSquare: 0.6,
            padding: const EdgeInsets.all(AppSpacing.sm),
          ),
        ),
      ),
    );
  }

  /// Search results are grouped by folder under headers, so the group list
  /// itself scrolls; each group's tiles still use the same tile.
  Widget groupGrid(List<DirEntry> entries) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(8),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 150,
        childAspectRatio: 0.82,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemCount: entries.length,
      itemBuilder: (context, i) => entryTile(entries[i], selectable: false),
    );
  }

  /// In select mode a tile can be dragged, and a folder tile can receive a
  /// drop. Dragging a selected item carries the whole selection; dragging an
  /// unselected one carries just itself.
  Widget draggableTile(DirEntry entry, Widget tile) {
    final payload = selected.contains(entry.path)
        ? selected.toList()
        : <String>[entry.path];
    final draggable = LongPressDraggable<List<String>>(
      data: payload,
      feedback: dragFeedback(payload.length),
      childWhenDragging: Opacity(opacity: 0.4, child: tile),
      child: tile,
    );
    if (!entry.isDir) return draggable;
    return DragTarget<List<String>>(
      // Reject a drop that would move a folder into itself or its own
      // subtree, so the target does not even light up for it.
      onWillAcceptWithDetails: (details) =>
          paths.movableInto(details.data, entry.path).isNotEmpty,
      onAcceptWithDetails: (details) =>
          unawaited(moveDropped(entry.path, details.data)),
      builder: (context, candidate, rejected) => DecoratedBox(
        decoration: BoxDecoration(
          border: candidate.isEmpty
              ? null
              : Border.all(
                  color: Theme.of(context).colorScheme.primary,
                  width: 2,
                ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: draggable,
      ),
    );
  }

  /// The chip that follows the finger while dragging [count] items.
  Widget dragFeedback(int count) {
    // Shadow policy: dark surfaces never get a shadow (elevation via fill
    // steps only); light surfaces may shadow floating/overlay elements,
    // which this drag-feedback chip is.
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: Theme.of(context).colorScheme.primaryContainer,
      borderRadius: BorderRadius.circular(8),
      elevation: isDark ? 0 : 6,
      child: Padding(
        // horizontal = 2x vertical (rule 22), both on the 4px spacing scale.
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.drive_file_move, size: 18),
            const SizedBox(width: 8),
            Text('$count', key: const Key('drag-count')),
          ],
        ),
      ),
    );
  }
}
