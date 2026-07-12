# dufs_client — mobile client for the self-hosted cloud

A Flutter Android app (`com.kuhy.dufs_client`) for the dufs cloud: browse
folders, view images (pinch-zoom), play videos (streaming/seek), upload from the
gallery, download, and delete — all over WebDAV with HTTP Basic auth.

Built as Phase 4 of the self-hosted-cloud work (dufs + KeePass sync + media sync
+ web gallery). This is a standalone companion app, kept outside the
`testsAndMisc` monorepo like the other `com.kuhy.*` apps.

## Status

- `flutter analyze` clean (very_good_analysis, strict, docs required).
- `flutter test` passes (WebDAV PROPFIND parsing, URL/auth building).
- `flutter build apk --debug` succeeds.
- **Not yet installed on the phone** — do that yourself (see below); the device
  was unavailable when this was built.

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
2. Build + install (NEVER uninstall — that wipes stored credentials):
   `flutter build apk --debug && adb install -r build/app/outputs/flutter-apk/app-debug.apk`
3. Launch + verify on-device (see the `phone-deploy` skill).

## Architecture

- `lib/services/dufs_client.dart` — WebDAV over `http` (PROPFIND list, GET/PUT/
  DELETE), Basic-auth headers reused by `Image.network` and the video player.
- `lib/services/settings.dart` — URL/user in `shared_preferences`, password in
  `flutter_secure_storage`.
- `lib/screens/` — browser, image viewer, video player, settings.

## Remote

No git remote is configured yet — set one up when you're ready (e.g. a private
GitHub repo like the other companion apps).
