# dufs_client — mobile client for the self-hosted cloud

A Flutter Android app (`com.kuhy.dufs_client`) for the dufs cloud: browse
folders, view images (pinch-zoom), play videos (streaming/seek), upload any
number of files of any type in one pick, download into the phone's public
`Download/` folder, and delete — all over WebDAV with HTTP Basic auth. Uploads
and downloads stream chunk by chunk with a progress banner and a Cancel button;
a finished download is announced as `Saved to Download/<name>` with an **Open**
action.

Built as Phase 4 of the self-hosted-cloud work (dufs + KeePass sync + media sync
+ web gallery). This is a standalone companion app, kept outside the
`testsAndMisc` monorepo like the other `com.kuhy.*` apps.

## Status

- `flutter analyze --fatal-infos --fatal-warnings` clean (very_good_analysis,
  strict, docs required).
- `flutter test --coverage`: 264 tests green at **100% line coverage**
  (1709/1709). CI fails the build below 100% — see `.github/workflows/ci.yml`.
  The suite covers the WebDAV client (streamed PUT/GET, progress, cancel), the
  browser (filter/sort/search, multi-select, drag-move, bulk delete/move,
  multi-upload, download to `Download/`, zip download), the media-index model,
  the platform-channel wrappers, and every viewer (image, video, audio, PDF,
  text).
- **Installed and running on `23181JEGR08034`** from the release APK.

Release APKs are signed with the shared `kuhy` release key: CI writes
`android/key.properties` from repository secrets, and locally the same file
points at the keystore under `~/.android/release/`. Every build carries the one
key, so `adb install -r` updates in place and the server password in
`flutter_secure_storage` survives. Without `key.properties` gradle falls back to
the debug key (see `android/app/build.gradle.kts`).

## First run

Launch it, tap the gear icon, and enter:

- **Server URL**: `https://kuhy-cloud.duckdns.org`
- **Username**: your dufs web user
- **Password**: your dufs web password (stored in the Android keystore via
  `flutter_secure_storage`, not in plain preferences)

Then browse from the cloud root.

## Deploy to the phone (`23181JEGR08034`)

`bash ~/.claude/scripts/phone_deploy.sh <this dir> --release --shot out.png`
does the whole pipeline: focus-mode whitelist check (`com.kuhy.*` apps are
otherwise killed ~1s after launch; the list lives in
`~/src/phone-focus-mode/config.sh`), release build with a build number derived from
the installed one, `adb install -r` (NEVER uninstall — that wipes stored
credentials), launch, screenshot. Then verify on-device (see the
`phone-deploy` skill).

## Architecture

- `lib/services/dufs_client.dart` — WebDAV over `http` (PROPFIND list, GET/PUT/
  DELETE), Basic-auth headers reused by `Image.network` and the video player.
  `upload` streams a `Stream<List<int>>` through a `StreamedRequest` with
  backpressure (`addStream`), `download` hands chunks to a callback; both take
  an `onProgress` byte counter and a `TransferCancel` flag. Progress
  denominators come from the picker / PROPFIND size, never `Content-Length`.
- `lib/models/transfer_progress.dart` — the banner model (`index/total`,
  bytes done/size, cancel flag) shared by uploads, downloads and zips.
- `android/.../MainActivity.kt` + `lib/services/public_downloads.dart` +
  `lib/services/device_picker.dart` — one MethodChannel
  (`com.kuhy.dufs_client/downloads`). Downloads are staged in the temp dir,
  moved into the public `Download/` collection through MediaStore (API 29+,
  hence `minSdk = 29`; MediaStore renames on collision and the toast shows the
  final name) and opened with `ACTION_VIEW`. Uploads come from a Storage Access
  Framework picker (`ACTION_OPEN_DOCUMENT`, multi, any type) whose content URIs
  are read chunk by chunk over the channel — no copy into the app cache, which
  is what `file_picker` does before returning and cost ~40 s for a 1 GB file.
  A cancelled upload DELETEs the truncated file dufs has already written.
- `lib/services/settings.dart` — URL/user in `shared_preferences`, password in
  `flutter_secure_storage`.
- `lib/screens/` — browser, image viewer, video player, audio, PDF, text
  editor, settings.
- `lib/models/media_meta.dart` — parses `/.meta/index.json`
  (`scripts/build_media_index.sh`): dimensions, duration, timestamps, and the
  two proxy paths.

### Which file the player actually streams

The browser streams the **original**, never the `.proxies/*.mp4` remux — that
one is built `-map 0:v:0 -map 0:a:0?`, so it has every embedded subtitle track
stripped, and libmpv handles the containers and AC3/DTS the browser proxy was
made for anyway. `proxyPath` exists for the web client.

The one exception is `appProxyPath`, a Matroska remux
(`<name>.app.mkv`) generated only for audio this app's libmpv build cannot
decode — TrueHD and MLP, whose decoders are absent from the shipped
`libmpv.so`, so the original plays as silent video. It keeps the subtitle
tracks, so preferring it costs nothing.
`Media/2026/07/truehd_regression_fixture.mkv` in the cloud is a 10s synthetic
h264+TrueHD+ASS file kept as a regression case for that path.

## Remote

`origin` → `https://github.com/kuhyx/dufs-cloud.git` (the app lives in the
`app/` subtree of the cloud repo, not in its own).
