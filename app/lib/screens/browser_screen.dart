import 'dart:async';
import 'dart:io';

import 'package:dufs_client/models/upload_source.dart';
import 'package:dufs_client/screens/browser/browser_bars.dart';
import 'package:dufs_client/screens/browser/browser_batch.dart';
import 'package:dufs_client/screens/browser/browser_body.dart';
import 'package:dufs_client/screens/browser/browser_fields.dart';
import 'package:dufs_client/screens/browser/browser_loading.dart';
import 'package:dufs_client/screens/browser/browser_mutations.dart';
import 'package:dufs_client/screens/browser/browser_opener.dart';
import 'package:dufs_client/screens/browser/browser_selection.dart';
import 'package:dufs_client/screens/browser/browser_transfers.dart';
import 'package:dufs_client/services/completion_cue.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/services/public_downloads.dart';
import 'package:dufs_client/services/settings.dart';
import 'package:dufs_client/widgets/transfer_banner.dart';
import 'package:flutter/material.dart';

/// Builds a [DufsClient] from resolved credentials (injectable for tests).
typedef ClientFactory =
    DufsClient Function({
      required String baseUrl,
      required String username,
      required String password,
    });

/// Opens the file picker and returns the chosen files (empty on cancel);
/// injectable so tests avoid the file_picker platform channel.
typedef PickUploads = Future<List<UploadSource>> Function();

/// The main screen: browse the cloud, open media, upload, download and delete.
class BrowserScreen extends StatefulWidget {
  /// Creates the browser backed by [settings]. The [clientFactory],
  /// [pickUploads], [tempDir], [publicDownloads] and [completionCue] seams
  /// default to real implementations and are overridden in tests to avoid
  /// platform channels.
  const BrowserScreen({
    required this.settings,
    this.clientFactory,
    this.pickUploads,
    this.tempDir,
    this.publicDownloads,
    this.completionCue,
    super.key,
  });

  /// Persisted connection settings.
  final Settings settings;

  /// Overrides how the dufs client is constructed.
  final ClientFactory? clientFactory;

  /// Overrides the file picker (defaults to `DevicePicker.pick`).
  final PickUploads? pickUploads;

  /// Overrides where a download is staged before it moves to Download/.
  final Future<Directory> Function()? tempDir;

  /// Overrides the Download/ mover + opener (defaults to the platform
  /// channel in `MainActivity.kt`).
  final PublicDownloads? publicDownloads;

  /// Overrides the completion cue (defaults to the platform sound, gated by
  /// the settings toggle).
  final CompletionCue? completionCue;

  @override
  State<BrowserScreen> createState() => _BrowserScreenState();
}

class _BrowserScreenState extends State<BrowserScreen>
    with
        BrowserFields,
        BrowserSelection,
        BrowserLoading,
        BrowserTransfers,
        BrowserMutations,
        BrowserBatch,
        BrowserOpener,
        BrowserBody,
        BrowserBars {
  @override
  void initState() {
    super.initState();
    unawaited(bootstrap());
  }

  @override
  void dispose() {
    search.dispose();
    dufsClient?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: canExit,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) onBack();
      },
      child: buildScaffold(),
    );
  }

  /// The scaffold: app bar, upload button, transfer banner and body.
  Widget buildScaffold() {
    return Scaffold(
      appBar: selecting ? selectAppBar() : browseAppBar(),
      floatingActionButton: dufsClient == null || selecting
          ? null
          : FloatingActionButton(
              onPressed: busy ? null : upload,
              child: const Icon(Icons.upload),
            ),
      body: Column(
        children: [
          if (transfer != null)
            TransferBanner(
              progress: transfer!,
              onCancel: transferCancel!.cancel,
            ),
          Expanded(child: buildBody()),
        ],
      ),
    );
  }
}
