import 'package:dufs_client/services/dufs_client.dart';
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
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
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
              color: Colors.white54,
            ),
          ),
        ),
      ),
    );
  }
}
