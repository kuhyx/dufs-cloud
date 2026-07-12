import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:flutter/material.dart';

/// A grid cell for one cloud entry: a thumbnail (media) or type icon, the base
/// name, and a human-readable size. Files carry a small overflow menu for
/// download/delete. An optional selection checkbox drives multi-select.
class EntryTile extends StatelessWidget {
  /// Creates a tile for [entry].
  const EntryTile({
    required this.client,
    required this.entry,
    required this.onTap,
    this.onLongPress,
    this.onDownload,
    this.onDelete,
    this.selected,
    this.onToggleSelect,
    super.key,
  });

  /// The client used to build thumbnail URLs.
  final DufsClient client;

  /// The entry to render.
  final DirEntry entry;

  /// Called when the tile body is tapped.
  final VoidCallback onTap;

  /// Called on a long-press of the tile body (enters multi-select); null
  /// disables the gesture.
  final VoidCallback? onLongPress;

  /// Called to download the file (files only; null hides the menu item).
  final VoidCallback? onDownload;

  /// Called to delete the entry (null hides the menu item).
  final VoidCallback? onDelete;

  /// Whether the tile is selected; null hides the selection checkbox.
  final bool? selected;

  /// Toggles selection when the checkbox is tapped.
  final VoidCallback? onToggleSelect;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          InkWell(
            onTap: onTap,
            onLongPress: onLongPress,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _preview()),
                Padding(
                  padding: const EdgeInsets.fromLTRB(6, 4, 6, 0),
                  child: Text(
                    entry.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(6, 0, 6, 6),
                  child: Text(
                    entry.isDir ? '' : paths.humanSize(entry.size),
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ),
              ],
            ),
          ),
          if (selected != null)
            Positioned(
              top: 0,
              left: 0,
              child: Checkbox(
                value: selected,
                onChanged: (_) => onToggleSelect?.call(),
              ),
            ),
          if (onDelete != null)
            Positioned(
              top: 0,
              right: 0,
              child: PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert),
                onSelected: (v) {
                  if (v == 'download') onDownload?.call();
                  if (v == 'delete') onDelete?.call();
                },
                itemBuilder: (_) => [
                  if (onDownload != null)
                    const PopupMenuItem(
                      value: 'download',
                      child: Text('Download'),
                    ),
                  const PopupMenuItem(value: 'delete', child: Text('Delete')),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _preview() {
    if (entry.isImage || entry.isVideo) {
      return Image.network(
        client.thumbUri(entry.path).toString(),
        headers: client.authHeaders,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Icon(_icon(), size: 40),
      );
    }
    return Icon(_icon(), size: 40);
  }

  IconData _icon() {
    if (entry.isDir) return Icons.folder;
    if (entry.isVideo) return Icons.movie;
    if (entry.isImage) return Icons.image;
    if (entry.isText) return Icons.description;
    return Icons.insert_drive_file;
  }
}
