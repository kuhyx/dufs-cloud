import 'dart:async';
import 'dart:io';

import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/models/media_meta.dart';
import 'package:dufs_client/screens/audio_screen.dart';
import 'package:dufs_client/screens/image_screen.dart';
import 'package:dufs_client/screens/pdf_screen.dart';
import 'package:dufs_client/screens/settings_screen.dart';
import 'package:dufs_client/screens/text_editor_screen.dart';
import 'package:dufs_client/screens/video_screen.dart';
import 'package:dufs_client/services/cloud_index.dart';
import 'package:dufs_client/services/download_zip.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:dufs_client/util/cloud_stats.dart';
import 'package:dufs_client/util/filter_sort.dart';
import 'package:dufs_client/util/paths.dart' as paths;
import 'package:dufs_client/widgets/entry_tile.dart';
import 'package:dufs_client/widgets/filter_sheet.dart';
import 'package:dufs_client/widgets/folder_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Builds a [DufsClient] from resolved credentials (injectable for tests).
typedef ClientFactory = DufsClient Function({
  required String baseUrl,
  required String username,
  required String password,
});

/// Opens the platform share sheet for [params]; injectable so tests avoid the
/// share_plus platform channel.
typedef ShareFn = Future<ShareResult> Function(ShareParams params);

/// The main screen: browse the cloud, open media, upload, download and delete.
class BrowserScreen extends StatefulWidget {
  /// Creates the browser backed by [settings]. The [clientFactory],
  /// [pickMedia] and [documentsDir] seams default to real implementations and
  /// are overridden in tests to avoid platform channels.
  const BrowserScreen({
    required this.settings,
    this.clientFactory,
    this.pickMedia,
    this.documentsDir,
    this.shareSheet,
    super.key,
  });

  /// Persisted connection settings.
  final Settings settings;

  /// Overrides how the dufs client is constructed.
  final ClientFactory? clientFactory;

  /// Overrides the media picker (returns the picked file, or null if
  /// the user cancelled).
  final Future<XFile?> Function()? pickMedia;

  /// Overrides where downloads are written.
  final Future<Directory> Function()? documentsDir;

  /// Overrides the share sheet (defaults to [SharePlus]).
  final ShareFn? shareSheet;

  @override
  State<BrowserScreen> createState() => _BrowserScreenState();
}

class _BrowserScreenState extends State<BrowserScreen> {
  DufsClient? _client;
  String _path = '/';
  List<DirEntry> _entries = <DirEntry>[];
  bool _loading = true;
  String? _error;
  bool _busy = false;

  MetaIndex _meta = <String, MediaMeta>{};
  FilterState _filter = defaultFilter;
  SortState _sort = defaultSort;
  final TextEditingController _search = TextEditingController();

  // Whole-cloud index for scoped global filtering: built lazily on first filter
  // use, cached, invalidated (set null) on mutations.
  List<DirEntry>? _index;
  bool _indexing = false;
  final Set<String> _collapsed = <String>{};

  // Multi-select mode (long-press to enter). Scoped to the current folder's
  // grid only: bulk move/zip assume every selection is a direct child of
  // [_path], which the whole-cloud filter view would violate.
  bool _selecting = false;
  final Set<String> _selected = <String>{};
  // Last item tapped without range mode armed — the range-select anchor
  // (touch's equivalent of shift-click's "last item clicked").
  String? _selectAnchor;
  // Armed by the "Range select" action bar button; the next tap extends
  // the selection from the anchor to that item, inclusive, then disarms.
  bool _rangeArmed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    _search.dispose();
    _client?.close();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    if (!widget.settings.isConfigured) {
      setState(() {
        _loading = false;
        _error = 'Tap the gear to set your cloud URL and login.';
      });
      return;
    }
    _client?.close();
    final build = widget.clientFactory ?? DufsClient.new;
    _client = build(
      baseUrl: widget.settings.baseUrl,
      username: widget.settings.username,
      password: await widget.settings.password(),
    );
    _meta = await _client!.fetchMeta();
    await _load('/');
  }

  Future<void> _load(String path) async {
    final client = _client;
    if (client == null) return;
    setState(() {
      _loading = true;
      _error = null;
      _path = path;
    });
    try {
      final entries = await client.list(path);
      if (!mounted) return;
      setState(() {
        _entries = entries;
        _loading = false;
      });
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  String get _parent {
    if (_path == '/') return '/';
    final cut = _path.substring(0, _path.lastIndexOf('/'));
    return cut.isEmpty ? '/' : cut;
  }

  // The cloud index restricted to the current folder's subtree.
  List<DirEntry> get _scoped => (_index ?? const <DirEntry>[])
      .where((e) => paths.underPath(e.path, _path))
      .toList();

  bool get _filterActive => isFilterActive(_filter);

  // Global search mode: an active filter, once the index is built.
  bool get _globalMode => _filterActive && _index != null;

  List<FolderGroup> get _groups {
    if (!_globalMode) return const [];
    final wantFolders = _filter.type == TypeFilter.folder;
    final pool =
        _scoped.where((e) => wantFolders ? e.isDir : !e.isDir).toList();
    return groupByFolder(applyFilterSort(pool, _meta, _filter, _sort));
  }

  Future<void> _ensureIndex() async {
    final client = _client;
    if (_index != null || _indexing || client == null) return;
    setState(() => _indexing = true);
    final index = await buildCloudIndex(client);
    if (!mounted) return;
    setState(() {
      _index = index;
      _indexing = false;
    });
  }

  void _setFilter(FilterState f) {
    setState(() => _filter = f);
    unawaited(_ensureIndex());
  }

  // Navigation exits any active search (its results are path-independent).
  void _navigate(String path) {
    _search.clear();
    setState(() {
      _filter = defaultFilter;
      _collapsed.clear();
    });
    unawaited(_load(path));
  }

  void _openFilterSheet() {
    unawaited(_ensureIndex());
    unawaited(showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => StatefulBuilder(
        builder: (_, setSheet) => FilterSheet(
          filter: _filter,
          sort: _sort,
          extensions: availableExtensions(_scoped),
          sizeValues: sizeValues(_scoped),
          durationValues: durationValues(_scoped, _meta),
          resolutionValues: resolutionValues(_scoped, _meta),
          onFilter: (f) {
            _setFilter(f);
            setSheet(() {});
          },
          onSort: (s) {
            setState(() => _sort = s);
            setSheet(() {});
          },
        ),
      ),
    ));
  }

  Future<void> _open(DirEntry entry) async {
    final client = _client;
    if (client == null) return;
    if (entry.isDir) {
      _navigate(entry.path);
    } else if (entry.isImage) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ImageScreen(
            client: client,
            path: entry.path,
            title: entry.name,
          ),
        ),
      );
    } else if (entry.isVideo) {
      // Prefer the browser/ExoPlayer-safe proxy generated by
      // generate_video_proxies.sh (e.g. AC3 audio remuxed to AAC) when one
      // exists for this file; otherwise stream the original.
      final playbackPath = _meta[entry.path]?.proxyPath ?? entry.path;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => VideoScreen(
            client: client,
            path: playbackPath,
            title: entry.name,
          ),
        ),
      );
    } else if (entry.isAudio) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => AudioScreen(
            client: client,
            path: entry.path,
            title: entry.name,
          ),
        ),
      );
    } else if (entry.isPdf) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => PdfScreen(
            client: client,
            path: entry.path,
            title: entry.name,
          ),
        ),
      );
    } else if (entry.isText) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => TextEditorScreen(
            client: client,
            path: entry.path,
            title: entry.name,
          ),
        ),
      );
    } else {
      await _download(entry);
    }
  }

  Future<void> _download(DirEntry entry) async {
    final client = _client;
    if (client == null) return;
    setState(() => _busy = true);
    try {
      final bytes = await client.download(entry.path);
      final getDir = widget.documentsDir ?? getApplicationDocumentsDirectory;
      final dir = await getDir();
      final file = File(p.join(dir.path, entry.name));
      await file.writeAsBytes(bytes);
      _snack('Saved ${entry.name} to app storage');
    } on Exception catch (e) {
      _snack('Download failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _upload() async {
    final client = _client;
    if (client == null) return;
    final picked = await (widget.pickMedia ?? ImagePicker().pickMedia)();
    if (picked == null) return;
    setState(() => _busy = true);
    try {
      await client.upload(_path, picked.name, await picked.readAsBytes());
      _snack('Uploaded ${picked.name}');
      _index = null;
      await _load(_path);
    } on Exception catch (e) {
      _snack('Upload failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(DirEntry entry) async {
    final client = _client;
    if (client == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete ${entry.name}?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await client.delete(entry.path);
      _index = null;
      await _load(_path);
    } on Exception catch (e) {
      _snack('Delete failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rename(DirEntry entry) async {
    final client = _client;
    if (client == null) return;
    final controller = TextEditingController(text: entry.name);
    final newName = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Rename "${entry.name}"'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'New name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Rename'),
          ),
        ],
      ),
    );
    if (newName == null || newName.isEmpty || newName == entry.name) return;
    setState(() => _busy = true);
    try {
      await client.rename(entry.path, newName);
      _index = null;
      await _load(_path);
    } on Exception catch (e) {
      _snack('Rename failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _newFolder() async {
    final client = _client;
    if (client == null) return;
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New folder'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Folder name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    setState(() => _busy = true);
    try {
      await client.createDir(paths.joinPath(_path, name));
      _index = null;
      await _load(_path);
    } on Exception catch (e) {
      _snack('Create failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // Long-press enters multi-select with the pressed entry already selected.
  void _enterSelect(DirEntry entry) {
    setState(() {
      _selecting = true;
      _selectAnchor = entry.path;
      _selected
        ..clear()
        ..add(entry.path);
    });
  }

  // A plain tap toggles just this entry and moves the anchor here; an armed
  // range-select tap instead selects every entry between the anchor and
  // this one (inclusive, in the current listing's order) and disarms.
  void _toggleSelect(DirEntry entry) {
    setState(() {
      final anchor = _selectAnchor;
      if (_rangeArmed && anchor != null) {
        final anchorIdx = _entries.indexWhere((e) => e.path == anchor);
        final targetIdx = _entries.indexWhere((e) => e.path == entry.path);
        // A pull-to-refresh during select mode can drop the anchor from the
        // listing without clearing the selection; fall back to a plain
        // toggle rather than extending from an index we no longer have.
        if (anchorIdx != -1 && targetIdx != -1) {
          final lo = anchorIdx < targetIdx ? anchorIdx : targetIdx;
          final hi = anchorIdx < targetIdx ? targetIdx : anchorIdx;
          for (final e in _entries.sublist(lo, hi + 1)) {
            _selected.add(e.path);
          }
          _selectAnchor = entry.path;
          _rangeArmed = false;
          return;
        }
      }
      if (!_selected.remove(entry.path)) _selected.add(entry.path);
      _selectAnchor = entry.path;
      _rangeArmed = false;
    });
  }

  void _toggleRangeArmed() {
    setState(() => _rangeArmed = !_rangeArmed);
  }

  void _exitSelect() {
    setState(() {
      _selecting = false;
      _selected.clear();
      _selectAnchor = null;
      _rangeArmed = false;
    });
  }

  // The current-folder entries whose paths are selected.
  List<DirEntry> get _selectedEntries =>
      _entries.where((e) => _selected.contains(e.path)).toList();

  // Runs [op] over every selected entry, collecting failures so one bad item
  // does not abort the batch; returns the number that failed.
  Future<int> _batch(Future<void> Function(DirEntry) op) async {
    var failed = 0;
    for (final entry in _selectedEntries) {
      try {
        await op(entry);
      } on Exception {
        failed++;
      }
    }
    return failed;
  }

  Future<void> _moveSelected() async {
    final client = _client;
    if (client == null || _selected.isEmpty) return;
    final dest = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (_) => FolderPicker(
          client: client,
          initialPath: _path,
          count: _selected.length,
        ),
      ),
    );
    // Cancelled, or a no-op move into the folder the items already live in.
    if (dest == null || dest == _path) return;
    setState(() => _busy = true);
    final failed = await _batch((e) => client.move(e.path, dest));
    if (failed > 0) _snack('$failed item(s) could not be moved');
    _index = null;
    _exitSelect();
    await _load(_path);
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _downloadSelectedZip() async {
    final client = _client;
    if (client == null || _selected.isEmpty) return;
    setState(() => _busy = true);
    try {
      final bytes = await buildSelectionZip(client, _path, _selectedEntries);
      final getDir = widget.documentsDir ?? getApplicationDocumentsDirectory;
      final dir = await getDir();
      final file = File(p.join(dir.path, 'dufs-selection.zip'));
      await file.writeAsBytes(bytes);
      final share = widget.shareSheet ?? SharePlus.instance.share;
      await share(ShareParams(files: [XFile(file.path)]));
      _exitSelect();
    } on Exception catch (e) {
      _snack('Zip failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteSelected() async {
    final client = _client;
    if (client == null || _selected.isEmpty) return;
    final n = _selected.length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete $n item${n == 1 ? '' : 's'}?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    final failed = await _batch((e) => client.delete(e.path));
    if (failed > 0) _snack('$failed item(s) could not be deleted');
    _index = null;
    _exitSelect();
    await _load(_path);
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _openSettings() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => SettingsScreen(settings: widget.settings),
      ),
    );
    if (changed ?? false) await _bootstrap();
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: _selecting ? _selectAppBar() : _browseAppBar(),
      floatingActionButton: _client == null || _selecting
          ? null
          : FloatingActionButton(
              onPressed: _busy ? null : _upload,
              child: const Icon(Icons.upload),
            ),
      body: _buildBody(),
    );
  }

  AppBar _browseAppBar() {
    return AppBar(
      leading: _path == '/'
          ? null
          : IconButton(
              icon: const Icon(Icons.arrow_upward),
              tooltip: 'Up',
              onPressed: () => _navigate(_parent),
            ),
      title: _client == null
          ? const Text('Cloud')
          : TextField(
              controller: _search,
              decoration: const InputDecoration(
                hintText: 'Filter by name…',
                border: InputBorder.none,
              ),
              onChanged: (t) => _setFilter(_filter.copyWith(query: t)),
            ),
      actions: [
        if (_client != null)
          IconButton(
            icon: Icon(
              _filterActive ? Icons.filter_alt : Icons.filter_alt_outlined,
            ),
            tooltip: 'Filters',
            onPressed: _openFilterSheet,
          ),
        if (_client != null)
          IconButton(
            icon: const Icon(Icons.create_new_folder),
            tooltip: 'New folder',
            onPressed: _busy ? null : _newFolder,
          ),
        IconButton(
          icon: const Icon(Icons.settings),
          onPressed: _openSettings,
        ),
      ],
    );
  }

  // Contextual action bar shown while items are selected.
  AppBar _selectAppBar() {
    return AppBar(
      leading: IconButton(
        icon: const Icon(Icons.close),
        tooltip: 'Cancel selection',
        onPressed: _exitSelect,
      ),
      title: Text('${_selected.length} selected'),
      actions: [
        IconButton(
          icon: Icon(
            Icons.checklist_rtl,
            color: _rangeArmed
                ? Theme.of(context).colorScheme.primary
                : null,
          ),
          tooltip: _rangeArmed
              ? 'Range select armed — tap an item'
              : 'Select range',
          onPressed: _busy ? null : _toggleRangeArmed,
        ),
        IconButton(
          icon: const Icon(Icons.drive_file_move),
          tooltip: 'Move',
          onPressed: _busy ? null : _moveSelected,
        ),
        IconButton(
          icon: const Icon(Icons.download),
          tooltip: 'Download zip',
          onPressed: _busy ? null : _downloadSelectedZip,
        ),
        IconButton(
          icon: const Icon(Icons.delete),
          tooltip: 'Delete',
          onPressed: _busy ? null : _deleteSelected,
        ),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, textAlign: TextAlign.center),
        ),
      );
    }
    if (_filterActive) {
      if (_index == null) {
        return const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 12),
              Text('Indexing the cloud…'),
            ],
          ),
        );
      }
      final groups = _groups;
      if (groups.isEmpty) {
        return const Center(child: Text('Nothing matches your filters.'));
      }
      return _buildGroups(groups);
    }
    if (_entries.isEmpty) {
      return const Center(child: Text('This folder is empty.'));
    }
    return RefreshIndicator(
      onRefresh: () => _load(_path),
      child: _grid(_entries, selectable: true),
    );
  }

  Widget _buildGroups(List<FolderGroup> groups) {
    return ListView(
      children: [
        for (final g in groups) ...[
          InkWell(
            onTap: () => setState(() {
              if (!_collapsed.remove(g.folder)) _collapsed.add(g.folder);
            }),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              child: Row(
                children: [
                  Icon(
                    _collapsed.contains(g.folder)
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
          if (!_collapsed.contains(g.folder))
            _grid(g.entries, shrinkWrap: true),
        ],
      ],
    );
  }

  Widget _grid(
    List<DirEntry> entries, {
    bool shrinkWrap = false,
    bool selectable = false,
  }) {
    final client = _client!;
    return GridView.builder(
      shrinkWrap: shrinkWrap,
      physics: shrinkWrap ? const NeverScrollableScrollPhysics() : null,
      padding: const EdgeInsets.all(8),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 150,
        childAspectRatio: 0.82,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemCount: entries.length,
      itemBuilder: (context, i) {
        final entry = entries[i];
        // While selecting, a tap toggles the item instead of opening it.
        final tile = EntryTile(
          client: client,
          entry: entry,
          onTap: () => selectable && _selecting
              ? _toggleSelect(entry)
              : unawaited(_open(entry)),
          // Long-press enters select mode; once selecting it starts a drag
          // instead, so the two gestures never compete for the same press.
          onLongPress: selectable && !_selecting
              ? () => _enterSelect(entry)
              : null,
          selected: selectable && _selecting
              ? _selected.contains(entry.path)
              : null,
          onToggleSelect: selectable ? () => _toggleSelect(entry) : null,
          onDownload: entry.isDir ? null : () => unawaited(_download(entry)),
          onRename: () => unawaited(_rename(entry)),
          onDelete: () => unawaited(_delete(entry)),
        );
        if (!selectable || !_selecting) return tile;
        return _draggableTile(entry, tile);
      },
    );
  }

  // In select mode a tile can be dragged, and a folder tile can receive a
  // drop. Dragging a selected item carries the whole selection; dragging an
  // unselected one carries just itself.
  Widget _draggableTile(DirEntry entry, Widget tile) {
    final payload = _selected.contains(entry.path)
        ? _selected.toList()
        : <String>[entry.path];
    final draggable = LongPressDraggable<List<String>>(
      data: payload,
      feedback: _dragFeedback(payload.length),
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
          unawaited(_moveDropped(entry.path, details.data)),
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

  Widget _dragFeedback(int count) {
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
        child: Text('Move $count item${count == 1 ? '' : 's'}'),
      ),
    );
  }

  // Moves the dropped entries into [destDir], skipping any the drop rules
  // disallow. Mirrors _moveSelected's batching so one bad item cannot abort
  // the rest.
  Future<void> _moveDropped(String destDir, List<String> dropped) async {
    final client = _client;
    if (client == null) return;
    final movable = paths.movableInto(dropped, destDir);
    if (movable.isEmpty) return;
    setState(() => _busy = true);
    var failed = 0;
    for (final path in movable) {
      try {
        await client.move(path, destDir);
      } on Exception {
        failed++;
      }
    }
    if (failed > 0) _snack('$failed item(s) could not be moved');
    _index = null;
    _exitSelect();
    await _load(_path);
    if (mounted) setState(() => _busy = false);
  }
}
