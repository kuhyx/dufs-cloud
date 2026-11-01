import 'package:dufs_client/models/dir_entry.dart';
import 'package:dufs_client/screens/audio_screen.dart';
import 'package:dufs_client/screens/browser/browser_batch.dart';
import 'package:dufs_client/screens/image_screen.dart';
import 'package:dufs_client/screens/pdf_screen.dart';
import 'package:dufs_client/screens/text_editor_screen.dart';
import 'package:dufs_client/screens/video_screen.dart';
import 'package:flutter/material.dart';

/// Opening an entry in the viewer that matches its type.
mixin BrowserOpener on BrowserBatch {
  /// Opens a folder, a viewer for media/text, or downloads anything else.
  Future<void> open(DirEntry entry) async {
    final client = dufsClient;
    if (client == null) return;
    if (entry.isDir) {
      navigate(entry.path);
    } else if (entry.isImage) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) =>
              ImageScreen(client: client, path: entry.path, title: entry.name),
        ),
      );
    } else if (entry.isVideo) {
      // Stream the original, never the browser `.mp4` remux: that one is built
      // with `-map 0:v:0 -map 0:a:0?` (generate_video_proxies.sh) and so has
      // every embedded subtitle track stripped out, which is exactly what this
      // player exists to show. libmpv handles the containers and AC3/DTS that
      // the browser proxy was made for. `MediaMeta.proxyPath` stays for the web
      // client.
      //
      // The one exception is `appProxyPath`, a Matroska remux made only for
      // audio libmpv cannot decode (TrueHD/MLP), which would otherwise play as
      // silent video. It keeps the subtitle tracks, so preferring it loses
      // nothing.
      final playbackPath = metaIndex[entry.path]?.appProxyPath ?? entry.path;
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
          builder: (_) =>
              AudioScreen(client: client, path: entry.path, title: entry.name),
        ),
      );
    } else if (entry.isPdf) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) =>
              PdfScreen(client: client, path: entry.path, title: entry.name),
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
      await download(entry);
    }
  }
}
