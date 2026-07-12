import 'package:dufs_client/screens/image_screen.dart';
import 'package:dufs_client/services/dufs_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows the title and a fallback icon when the image fails',
      (tester) async {
    final client =
        DufsClient(baseUrl: 'https://host', username: 'u', password: 'p');
    addTearDown(client.close);
    await tester.pumpWidget(
      MaterialApp(
        home: ImageScreen(client: client, path: '/pic.jpg', title: 'pic.jpg'),
      ),
    );
    // Network images return 400 under the test binding, tripping errorBuilder.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('pic.jpg'), findsOneWidget);
    expect(find.byIcon(Icons.broken_image), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsOneWidget);
  });
}
