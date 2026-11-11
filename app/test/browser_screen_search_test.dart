import 'package:dufs_client/util/filter_sort.dart';
import 'package:dufs_client/widgets/filter_sheet.dart';
import 'package:dufs_client/widgets/indexing_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:media_kit/media_kit.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'support/browser_harness.dart';
import 'support/browser_mocks.dart';
import 'support/fake_webview_platform.dart';
import 'support/finders.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // BrowserScreen pushes a real VideoScreen, which builds a MediaKitPlayer
  // (libmpv) rather than a fake — so the native library has to be loaded here
  // exactly as main.dart does it.
  MediaKit.ensureInitialized();

  setUp(() {
    WebViewPlatform.instance = FakeWebViewPlatform();
  });

  testWidgets('searching filters the whole cloud into a collapsible group', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();

    // Typing in the AppBar search box activates the filter, which lazily
    // indexes the cloud and re-renders matches grouped by their folder.
    await tester.enterText(find.byType(TextField), 'pic');
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
    expect(find.text('clip.mp4'), findsNothing); // filtered out by the query
    // The single match lives at the root, so one '/' group header appears.
    expect(find.text('/'), findsOneWidget);

    // Collapsing the group header hides its grid; expanding restores it.
    await tester.tap(find.text('/'));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsNothing);
    await tester.tap(find.text('/'));
    await tester.pumpAndSettle();
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('shows an indexing state while the cloud is walked', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    // A deliberately slow PROPFIND keeps the index build pending long enough
    // to observe the intermediate "Indexing…" frame before it resolves.
    final mock = MockClient((req) async {
      switch (req.method) {
        case 'PROPFIND':
          await Future<void>.delayed(const Duration(milliseconds: 40));
          if (req.url.path == '/Sub') return http.Response(listingXml([]), 207);
          return http.Response(listingXml(rootListing), 207);
        default:
          return http.Response.bytes([1, 2, 3], 200);
      }
    });
    await tester.pumpWidget(browserApp(settings, mock));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'pic');
    await tester.pump(); // one frame: filter active, index still building
    expect(find.byType(IndexingView), findsOneWidget);
    await tester.pumpAndSettle(); // drain the delayed walk
    expect(find.text('pic.jpg'), findsOneWidget);
  });

  testWidgets('a query with no matches shows the empty-filter message', (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'zzzzz');
    await tester.pumpAndSettle();
    expect(spoken('Nothing matches your filters'), findsOneWidget);
  });

  testWidgets("the sheet's Clear button also empties the search box", (
    tester,
  ) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'clip');
    await tester.pumpAndSettle();
    expect(find.text('clip'), findsOneWidget);

    await tester.tap(spoken('Filters'));
    await tester.pumpAndSettle();
    final clear = spoken('Clear');
    await tester.ensureVisible(clear);
    await tester.pumpAndSettle();
    await tester.tap(clear);
    await tester.pumpAndSettle();

    // Leaving the old query on screen would advertise a filter that is no
    // longer applied.
    expect(find.text('clip'), findsNothing);
  });

  testWidgets('the filter sheet edits type and sort', (tester) async {
    final settings = await testSettings(configured: true);
    await tester.pumpWidget(browserApp(settings, browserMock()));
    await tester.pumpAndSettle();

    await tester.tap(spoken('Filters'));
    await tester.pumpAndSettle();
    expect(find.byType(FilterSheet), findsOneWidget);

    // Toggling sort direction routes through the sheet's onSort callback.
    await tester.tap(spoken('Ascending'));
    await tester.pumpAndSettle();
    expect(spoken('Descending'), findsOneWidget);

    // Choosing a type from the dropdown routes through onFilter.
    await tester.tap(find.byType(DropdownButton<TypeFilter>));
    await tester.pumpAndSettle();
    await tester.tap(spoken('Images').last);
    await tester.pumpAndSettle();
    expect(find.byType(FilterSheet), findsOneWidget);
  });
}
