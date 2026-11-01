import 'package:dufs_client/screens/browser/browser_body.dart';
import 'package:flutter/material.dart';

/// The two app bars: browsing and the contextual one shown while selecting.
mixin BrowserBars on BrowserBody {
  /// The regular bar: up, search box, filters, new folder and settings.
  AppBar browseAppBar() {
    return AppBar(
      leading: currentPath == '/'
          ? null
          : IconButton(
              icon: const Icon(Icons.arrow_upward),
              tooltip: 'Up',
              onPressed: () => navigate(parentPath),
            ),
      title: dufsClient == null
          ? const Text('Cloud')
          : TextField(
              controller: search,
              decoration: const InputDecoration(
                hintText: 'Filter by name…',
                border: InputBorder.none,
              ),
              onChanged: (t) => setFilter(filter.copyWith(query: t)),
            ),
      actions: [
        if (dufsClient != null)
          IconButton(
            icon: Icon(
              filterActive ? Icons.filter_alt : Icons.filter_alt_outlined,
            ),
            tooltip: 'Filters',
            onPressed: openFilterSheet,
          ),
        if (dufsClient != null)
          IconButton(
            icon: const Icon(Icons.create_new_folder),
            tooltip: 'New folder',
            onPressed: busy ? null : newFolder,
          ),
        IconButton(icon: const Icon(Icons.settings), onPressed: openSettings),
      ],
    );
  }

  /// Contextual action bar shown while items are selected.
  AppBar selectAppBar() {
    return AppBar(
      leading: IconButton(
        icon: const Icon(Icons.close),
        tooltip: 'Cancel selection',
        onPressed: exitSelect,
      ),
      title: Text('${selected.length} selected'),
      actions: [
        IconButton(
          icon: Icon(
            Icons.checklist_rtl,
            color: rangeArmed ? Theme.of(context).colorScheme.primary : null,
          ),
          tooltip: rangeArmed
              ? 'Range select armed — tap an item'
              : 'Select range',
          onPressed: busy ? null : toggleRangeArmed,
        ),
        IconButton(
          icon: const Icon(Icons.drive_file_move),
          tooltip: 'Move',
          onPressed: busy ? null : moveSelected,
        ),
        IconButton(
          icon: const Icon(Icons.download),
          tooltip: 'Download zip',
          onPressed: busy ? null : downloadSelectedZip,
        ),
        IconButton(
          icon: const Icon(Icons.delete),
          tooltip: 'Delete',
          onPressed: busy ? null : deleteSelected,
        ),
      ],
    );
  }
}
