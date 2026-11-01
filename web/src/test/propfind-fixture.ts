export const PROPFIND_XML = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/Media/2026/07/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/Media/2026/07/sub/</D:href>
    <D:propstat><D:prop>
      <D:resourcetype><D:collection/></D:resourcetype>
      <D:getlastmodified>Sat, 12 Jul 2026 03:00:00 GMT</D:getlastmodified>
    </D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/Media/2026/07/a%20b.jpg</D:href>
    <D:propstat><D:prop>
      <D:resourcetype/>
      <D:getcontentlength>2048</D:getcontentlength>
      <D:getlastmodified>Sat, 12 Jul 2026 03:00:00 GMT</D:getlastmodified>
    </D:prop></D:propstat>
  </D:response>
  <D:response><D:href></D:href></D:response>
</D:multistatus>`;
