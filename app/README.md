# dufs_client — mobile client for the self-hosted cloud

A Flutter Android app (`com.kuhy.dufs_client`) for the dufs cloud: browse
folders, view images (pinch-zoom), play videos (streaming/seek), upload from the
gallery, download, and delete — all over WebDAV with HTTP Basic auth.

Built as Phase 4 of the self-hosted-cloud work (dufs + KeePass sync + media sync
+ web gallery). This is a standalone companion app, kept outside the
`testsAndMisc` monorepo like the other `com.kuhy.*` apps.

## Status

- `flutter analyze --fatal-infos --fatal-warnings` clean (very_good_analysis,
  strict, docs required).
- `flutter test --coverage`: 234 tests green at **100% line coverage**
  (1519/1519). CI fails the build below 100% — see `.github/workflows/ci.yml`.
  The suite covers the WebDAV client, the browser (filter/sort/search,
  multi-select, drag-move, bulk delete/move, zip download), the media-index
  model, and every viewer (image, video, audio, PDF, text).
- `flutter build apk --release --split-per-abi` succeeds (arm64-v8a 36.3 MB).
- **Installed and running on `BL9000EEA0000102`** from the arm64-v8a release
  APK.

Release APKs are still signed with the **debug** key (the stock
`android/app/build.gradle.kts` TODO). That is deliberate: it keeps the release
build installable over the existing one with `adb install -r`, so the server
password in `flutter_secure_storage` survives. Generating a real keystore would
force an uninstall and wipe it.

## First run

Launch it, tap the gear icon, and enter:

- **Server URL**: `https://kuhy-cloud.duckdns.org`
- **Username**: your dufs web user
- **Password**: your dufs web password (stored in the Android keystore via
  `flutter_secure_storage`, not in plain preferences)

Then browse from the cloud root.

## Deploy to the phone (`BL9000EEA0000102`)

The `com.kuhy.*` focus-mode whitelist will otherwise kill the app ~1s after
launch, so whitelist it first:

1. Add `com.kuhy.dufs_client` to `$WHITELIST` in
   `~/testsAndMisc/phone_focus_mode/config.sh`, then redeploy focus mode:
   `ADB_SERIAL=BL9000EEA0000102 bash ~/testsAndMisc/phone_focus_mode/deploy.sh`
2. Build + install (NEVER uninstall — that wipes stored credentials). The phone
   is arm64, so take that split:
   `flutter build apk --release --split-per-abi && adb install -r build/app/outputs/flutter-apk/app-arm64-v8a-release.apk`
3. Launch + verify on-device (see the `phone-deploy` skill).

## Architecture

- `lib/services/dufs_client.dart` — WebDAV over `http` (PROPFIND list, GET/PUT/
  DELETE), Basic-auth headers reused by `Image.network` and the video player.
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
