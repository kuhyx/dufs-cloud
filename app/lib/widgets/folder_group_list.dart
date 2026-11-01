import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/util/cloud_stats.dart';
import 'package:flutter/material.dart';

/// Search results grouped by folder: a collapsible header per group with that
/// group's tiles (from [groupGrid]) underneath.
class FolderGroupList extends StatelessWidget {
  /// Creates the list for [groups]; folders in [collapsed] hide their tiles.
  const FolderGroupList({
    required this.groups,
    required this.collapsed,
    required this.onToggle,
    required this.groupGrid,
    super.key,
  });

  /// The groups to show, in order.
  final List<FolderGroup> groups;

  /// Folders whose tiles are currently hidden.
  final Set<String> collapsed;

  /// Called with a group's folder when its header is tapped.
  final void Function(String folder) onToggle;

  /// Builds the tile grid of one group's entries.
  final Widget Function(List<DirEntry> entries) groupGrid;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        for (final g in groups) ...[
          InkWell(
            onTap: () => onToggle(g.folder),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              child: Row(
                children: [
                  Icon(
                    collapsed.contains(g.folder)
                        ? Icons.chevron_right
                        : Icons.expand_more,
                    size: 20,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(g.folder, overflow: TextOverflow.ellipsis),
                  ),
                  Text('${g.entries.length}'),
                ],
              ),
            ),
          ),
          if (!collapsed.contains(g.folder)) groupGrid(g.entries),
        ],
      ],
    );
  }
}
