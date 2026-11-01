import 'package:dufs_client/services/cloud_index.dart';
import 'package:flutter/material.dart';

/// The index walk's honest progress: counts of what has been listed so far
/// (never a fraction: the total is unknown) and a way out.
class IndexingView extends StatelessWidget {
  /// Creates the view for the walk's live [progress]; [onCancel] stops it.
  const IndexingView({
    required this.progress,
    required this.onCancel,
    super.key,
  });

  /// Counts of folders and entries listed so far.
  final IndexProgress progress;

  /// Stops the walk; null when there is nothing to cancel.
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 12),
          const Text('Indexing the cloud…'),
          const SizedBox(height: 8),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.folder_outlined),
              Text('${progress.folders}', key: const Key('index-folders')),
              const SizedBox(width: 16),
              const Icon(Icons.insert_drive_file_outlined),
              Text('${progress.entries}', key: const Key('index-entries')),
            ],
          ),
          Semantics(
            label: 'Cancel indexing',
            button: true,
            excludeSemantics: true,
            child: IconButton(
              icon: const Icon(Icons.close),
              onPressed: onCancel,
            ),
          ),
        ],
      ),
    );
  }
}
