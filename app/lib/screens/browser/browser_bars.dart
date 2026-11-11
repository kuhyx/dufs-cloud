import 'package:dufs_client/screens/browser/browser_body.dart';
import 'package:flutter/material.dart';

/// The two app bars: browsing and the contextual one shown while selecting.
/// Every control is a glyph; the old wording is the spoken label.
mixin BrowserBars on BrowserBody {
  /// The regular bar: up, search box, filters, new folder and settings.
  AppBar browseAppBar() {
    return AppBar(
      leading: currentPath == '/'
          ? null
          : IconButton(
              icon: const Icon(Icons.arrow_upward, semanticLabel: 'Up'),
              onPressed: () => navigate(parentPath),
            ),
      title: dufsClient == null
          ? null
          : TextField(
              controller: search,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search, semanticLabel: 'Filter'),
                border: InputBorder.none,
              ),
              onChanged: (t) => setFilter(filter.copyWith(query: t)),
            ),
      actions: [
        if (dufsClient != null)
          IconButton(
            icon: Icon(
              filterActive ? Icons.filter_alt : Icons.filter_alt_outlined,
              semanticLabel: 'Filters',
            ),
            onPressed: openFilterSheet,
          ),
        if (dufsClient != null)
          IconButton(
            icon: const Icon(
              Icons.create_new_folder,
              semanticLabel: 'New folder',
            ),
            onPressed: busy ? null : newFolder,
          ),
        IconButton(
          icon: const Icon(Icons.settings, semanticLabel: 'Settings'),
          onPressed: openSettings,
        ),
      ],
    );
  }

  /// Contextual action bar shown while items are selected.
  AppBar selectAppBar() {
    return AppBar(
      leading: IconButton(
        icon: const Icon(Icons.close, semanticLabel: 'Cancel selection'),
        onPressed: exitSelect,
      ),
      // Checked-box glyph + count: how many are selected.
      title: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check_box),
          const SizedBox(width: 8),
          Text('${selected.length}', key: const Key('selected-count')),
        ],
      ),
      actions: [
        IconButton(
          // Armed state: primary tint + filled background (two channels).
          isSelected: rangeArmed,
          style: rangeArmed
              ? IconButton.styleFrom(
                  backgroundColor: Theme.of(
                    context,
                  ).colorScheme.primaryContainer,
                )
              : null,
          icon: Icon(
            Icons.checklist_rtl,
            color: rangeArmed ? Theme.of(context).colorScheme.primary : null,
            semanticLabel: rangeArmed
                ? 'Range select armed — tap an item'
                : 'Select range',
          ),
          onPressed: busy ? null : toggleRangeArmed,
        ),
        IconButton(
          icon: const Icon(Icons.drive_file_move, semanticLabel: 'Move'),
          onPressed: busy ? null : moveSelected,
        ),
        IconButton(
          icon: const Icon(Icons.folder_zip, semanticLabel: 'Download zip'),
          onPressed: busy ? null : downloadSelectedZip,
        ),
        IconButton(
          icon: const Icon(Icons.delete, semanticLabel: 'Delete'),
          onPressed: busy ? null : deleteSelected,
        ),
      ],
    );
  }
}
