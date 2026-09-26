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
| `firebase_backup/` | Python: daily backup of the kuhy-syncs Firebase RTDB into the cloud, plus restore |

## `web/` — the gallery SPA

Browse folders, thumbnail grid, image lightbox (zoom), inline video, upload
(many files at once, XHR so a progress banner with Cancel can track each one),
download (single files browser-native; multi-select as a client-side zip with
per-file progress), delete, and a small `.txt`/`.md` editor. Lists directories with WebDAV
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

Browse, view images (pinch-zoom), play videos (streaming/seek), multi-upload
any file type, download into the phone's `Download/` folder (with progress,
Cancel, and an Open action on the toast), and delete — all over WebDAV with
HTTP Basic auth. Password
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

## `firebase_backup/` — daily Firebase backup and restore

Every app syncs through one Firebase Realtime Database (`kuhy-syncs`), so a
root export is all of their data. Once a day a systemd **user** timer writes
`~/data/cloud/firebase_backups/kuhy-syncs-<UTC time>.json.gz` (0600, dir
0700; dufs serves it to the `kuhy` login only). Snapshots are kept forever.

```bash
scripts/setup_firebase_backup.sh          # install + enable firebase-backup.timer
scripts/seed_firebase_backup_session.sh   # one Google consent: the job's own session
systemctl --user start firebase-backup    # run one backup now
python3 -m firebase_backup.restore latest # dry run: per-namespace diff vs live
python3 -m firebase_backup.restore <file> --namespace todo-sync --yes
```

A run fails if the export is empty or a namespace from the previous snapshot
has vanished (the new snapshot is still written). Any failure -- including
an import error or a timeout -- triggers `firebase-backup-failure.service`,
which appends to `~/.local/state/firebase-backup/failures.log`, sends a
critical notification, and writes `prompts/TODO-firebase-backup-failure.md`:
a ready-to-paste Claude prompt with the failure class, the fix, and the
journal excerpt (tokens redacted). Every run is logged to `backup.log` there.

Restore is a dry run unless `--yes`. With `--yes` it first writes a
`-pre-restore` snapshot of the live data, then PUTs each changed namespace on
its own (never the root, so namespaces newer than the snapshot survive) and
reads each back to verify.

```bash
pip install -e '.[dev]'
ruff check firebase_backup && python3 -m pytest   # 100% branch coverage
bats scripts/tests                                # the failure handler
```

## `scripts/` — setup & daemons

- `setup_dufs_cloud.sh` — install and configure dufs (serve-path, auth, service).
- `setup_cloud_gallery.sh` — build `web/` and deploy it as the dufs UI (render-spa).
- `sync_media_to_cloud.sh` / `setup_media_cloud_sync.sh` — MOVE `~/Downloads`
  images/videos into `Media/YYYY/MM` (deduplicated), on a timer + path watcher.
- `import_media_archives.sh` — fold `media_archive_*.zip` snapshots into the cloud.
- `generate_thumbnails.sh` — image thumbnails (ImageMagick) + video posters (ffmpeg).
- `add_dufs_login.sh` — a login scoped to one folder for an app (see below).
- `setup_firebase_backup.sh`, `seed_firebase_backup_session.sh`,
  `firebase_backup_on_failure.sh` — the Firebase backup (see above).

The scripts target an Arch Linux host and self-install their dependencies.

### Adding an app login

Each app that writes to the cloud gets its own login, scoped to one folder,
so a leaked phone credential cannot reach anything else (e.g. Keepass):

```bash
scripts/add_dufs_login.sh todo /todo-images rw      # rw or ro
scripts/add_dufs_login.sh todo /todo-images --rotate  # new password
```

It adds a hashed entry to `~/.config/dufs/dufs.yaml` (the form
`setup_dufs_cloud.sh` preserves), restarts dufs, **proves** the scope (207 on
the folder, 403 just outside it — otherwise it restores the old config and
fails), writes `~/.config/dufs/logins/<user>.env` (0600) and puts the
32-character alphanumeric password on the clipboard. Re-running is a no-op.
Tests: `bats scripts/tests`.

## CI

`.github/workflows/ci.yml` runs on every push/PR: the web job lints, tests
(100% coverage), and builds the SPA; the app job analyzes with fatal infos,
tests, and enforces 100% Flutter line coverage.

## History

Extracted with full git history from the `testsAndMisc` monorepo (`web/`,
`scripts/`) and the standalone `dufs_client` repo (`app/`).
