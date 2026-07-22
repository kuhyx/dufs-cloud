import 'package:dufs_client/services/dufs_client.dart';
import 'package:dufs_client/ui/theme.dart';
import 'package:flutter/material.dart';

/// Full-screen image viewer with pinch-zoom, loaded over authenticated HTTP.
class ImageScreen extends StatelessWidget {
  /// Creates a viewer for [path] using [client].
  const ImageScreen({
    required this.client,
    required this.path,
    required this.title,
    super.key,
  });

  /// The dufs client (supplies the URL and auth headers).
  final DufsClient client;

  /// Absolute cloud path of the image.
  final String path;

  /// Title shown in the app bar.
  final String title;

  @override
  Widget build(BuildContext context) {
    // Always dark regardless of the app's own theme — a media viewer's
    // chrome shouldn't compete with the image, same convention as every
    // photo app. See AppViewerColors' doc comment.
    return Scaffold(
      backgroundColor: AppViewerColors.background,
      appBar: AppBar(
        backgroundColor: AppViewerColors.background,
        foregroundColor: AppViewerColors.foreground,
        title: Text(title),
      ),
      body: Center(
        child: InteractiveViewer(
          maxScale: 6,
          child: Image.network(
            client.fileUri(path).toString(),
            headers: client.authHeaders,
            fit: BoxFit.contain,
            errorBuilder: (context, error, stack) => const Icon(
              Icons.broken_image,
              size: 64,
              color: AppViewerColors.muted,
            ),
          ),
        ),
      ),
    );
  }
}
