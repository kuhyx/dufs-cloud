# dufs-cloud

A self-hosted "Google Drive alternative" built on
[**dufs**](https://github.com/sigoden/dufs) (a single-binary WebDAV/HTTP file
server): a React web gallery, a Flutter mobile client, and the setup scripts
that stand the whole thing up behind your own domain.

One folder on your PC is the single source of truth; dufs serves it, and both
apps talk to the same WebDAV endpoint.

## Layout

| Path       | What it is                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| `web/`     | React 19 + Vite + TypeScript SPA — the browser UI (served by dufs itself)  |
| `app/`     | Flutter Android client (`com.kuhy.dufs_client`) over WebDAV + Basic auth   |
| `scripts/` | Bash installers/daemons: set up dufs, deploy the gallery, sync media, etc. |

## `web/` — the gallery SPA

Browse folders, thumbnail grid, image lightbox (zoom), inline video, upload,
download, delete, and a small `.txt`/`.md` editor. Lists directories with WebDAV
PROPFIND and streams files with GET, so it runs under dufs `render-spa` behind
the server's own auth.

```bash
cd web
pnpm install
pnpm run lint       # tsc + eslint (strict + stylistic type-checked, react-hooks)
pnpm run coverage   # vitest — thresholds enforce 100%
pnpm run build
```

## `app/` — the mobile client

Browse, view images (pinch-zoom), play videos (streaming/seek), upload from the
gallery, download, and delete — all over WebDAV with HTTP Basic auth. Password
is kept in the Android keystore (`flutter_secure_storage`).

Video and audio play through `media_kit` (libmpv + libass), so embedded ASS
subtitle tracks render with their own styling and can be switched at runtime.
That makes **libmpv a host prerequisite for `flutter test`** — the player tests
construct a real libmpv instance over `dart:ffi`:

```bash
sudo pacman -S mpv          # Arch; Debian/Ubuntu: apt install libmpv2
cd app
flutter pub get
flutter analyze --fatal-infos --fatal-warnings   # very_good_analysis, strict
flutter test --coverage                          # 100% line coverage
flutter build apk --debug
```

## `scripts/` — setup & daemons

- `setup_dufs_cloud.sh` — install and configure dufs (serve-path, auth, service).
- `setup_cloud_gallery.sh` — build `web/` and deploy it as the dufs UI (render-spa).
- `sync_media_to_cloud.sh` / `setup_media_cloud_sync.sh` — MOVE `~/Downloads`
  images/videos into `Media/YYYY/MM` (deduplicated), on a timer + path watcher.
- `import_media_archives.sh` — fold `media_archive_*.zip` snapshots into the cloud.
- `generate_thumbnails.sh` — image thumbnails (ImageMagick) + video posters (ffmpeg).

The scripts target an Arch Linux host and self-install their dependencies.

## CI

`.github/workflows/ci.yml` runs on every push/PR: the web job lints, tests
(100% coverage), and builds the SPA; the app job analyzes with fatal infos,
tests, and enforces 100% Flutter line coverage.

## History

Extracted with full git history from the `testsAndMisc` monorepo (`web/`,
`scripts/`) and the standalone `dufs_client` repo (`app/`).
