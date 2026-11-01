import 'package:dufs_client/services/dufs_client.dart';
import 'package:http/testing.dart';

/// A PROPFIND multistatus body: a folder, a sub-folder, one file and an
/// empty-href response.
const String propfindXml = '''
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/Media/2026/07/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype>
    </D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/Media/2026/07/sub/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype>
    </D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/Media/2026/07/a%20b.jpg</D:href>
    <D:propstat><D:prop><D:resourcetype/>
    <D:getcontentlength>2048</D:getcontentlength></D:prop></D:propstat>
  </D:response>
  <D:response><D:href></D:href></D:response>
</D:multistatus>
''';

DufsClient clientWith(MockClient mock) => DufsClient(
  baseUrl: 'https://host/',
  username: 'u',
  password: 'p',
  httpClient: mock,
);
