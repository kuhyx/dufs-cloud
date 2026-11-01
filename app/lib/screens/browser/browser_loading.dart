import 'dart:async';

import 'package:dufs_client/models/transfer_progress.dart';
import 'package:dufs_client/screens/browser/browser_selection.dart';
import 'package:dufs_client/screens/settings_screen.dart';
import 'package:dufs_client/services/cloud_index.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/util/cloud_stats.dart';
import 'package:dufs_client/util/filter_sort.dart';
import 'package:dufs_client/widgets/filter_sheet.dart';
import 'package:flutter/material.dart';

/// Connecting, listing, the whole-cloud index, filtering and back handling.
mixin BrowserLoading on BrowserSelection {
  /// Builds the client from the settings, fetches the metadata and lists `/`.
  Future<void> bootstrap() async {
    if (!widget.settings.isConfigured) {
      setState(() {
        loading = false;
        loadError = 'Tap the gear to set your cloud URL and login.';
      });
      return;
    }
    dufsClient?.close();
    final build = widget.clientFactory ?? DufsClient.new;
    dufsClient = build(
      baseUrl: widget.settings.baseUrl,
      username: widget.settings.username,
      password: await widget.settings.password(),
    );
    metaIndex = await dufsClient!.fetchMeta();
    await load('/');
  }

  /// Lists [path] and shows it.
  Future<void> load(String path) async {
    final client = dufsClient;
    if (client == null) return;
    setState(() {
      loading = true;
      loadError = null;
      currentPath = path;
    });
    try {
      final entries = await client.list(path);
      if (!mounted) return;
      setState(() {
        listing = entries;
        loading = false;
      });
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() {
        loadError = '$e';
        loading = false;
      });
    }
  }

  /// Builds the whole-cloud index unless it exists or is being built.
  Future<void> ensureIndex() async {
    final client = dufsClient;
    if (cloudIndex != null || indexing || client == null) return;
    final cancel = TransferCancel();
    setState(() {
      indexing = true;
      indexProgress = IndexProgress.none;
      indexCancel = cancel;
    });
    final index = await buildCloudIndex(
      client,
      cancel: cancel,
      onProgress: (p) {
        if (mounted) setState(() => indexProgress = p);
      },
    );
    if (!mounted) return;
    setState(() {
      cloudIndex = index;
      indexing = false;
      indexPartial = cancel.cancelled;
      indexCancel = null;
    });
  }

  /// Applies [f] and starts the index build the filter needs.
  void setFilter(FilterState f) {
    // Keep the app-bar search box in step when the query is changed from
    // somewhere else — the sheet's Clear button resets it to empty, and
    // leaving the old text on screen would claim a filter that is no longer
    // applied. Typing already leaves the two equal, so this is a no-op then.
    if (search.text != f.query) search.text = f.query;
    setState(() => filter = f);
    unawaited(ensureIndex());
  }

  /// Navigation exits any active search (its results are path-independent).
  void navigate(String path) {
    search.clear();
    setState(() {
      filter = defaultFilter;
      collapsed.clear();
    });
    unawaited(load(path));
  }

  /// Peels one layer: selection, then the filter, then one folder up.
  void onBack() {
    if (selecting) {
      exitSelect();
    } else if (filterActive) {
      search.clear();
      setState(() {
        filter = defaultFilter;
        collapsed.clear();
      });
    } else {
      navigate(parentPath);
    }
  }

  /// Shows the filter and sort sheet.
  void openFilterSheet() {
    unawaited(ensureIndex());
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => StatefulBuilder(
          builder: (_, setSheet) => FilterSheet(
            filter: filter,
            sort: sort,
            extensions: availableExtensions(scoped),
            sizeValues: sizeValues(scoped),
            durationValues: durationValues(scoped, metaIndex),
            resolutionValues: resolutionValues(scoped, metaIndex),
            onFilter: (f) {
              setFilter(f);
              setSheet(() {});
            },
            onSort: (s) {
              setState(() => sort = s);
              setSheet(() {});
            },
          ),
        ),
      ),
    );
  }

  /// Opens settings and reconnects when they changed.
  Future<void> openSettings() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => SettingsScreen(settings: widget.settings),
      ),
    );
    if (changed ?? false) await bootstrap();
  }
}
