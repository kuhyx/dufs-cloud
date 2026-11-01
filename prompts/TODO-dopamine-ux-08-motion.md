# dufs-cloud motion: remaining work

Done 2026-11-01 (see git log): index walk shows true folder/entry counts and
cancels (web + app), reduced-motion block in `web/src/index.css`, motion
tokens (`@kuhyx/web-ui` web_ui-v0.3.2, `design_system` v0.3.0), debounced
search, selection haptic on long-press. ZIP and upload already had per-file
progress and cancel before this prompt.

## what
1. Step 2, sound: a completion cue for long operations only (index built, ZIP
   ready, upload finished), skipped when the operation took under 2 s. Ships
   on, with an opt-out toggle in `app/lib/screens/settings_screen.dart` (store:
   `app/lib/services/settings.dart`) and an equivalent on web. Blocked: the
   toggle label is new UI text, which needs kuhy's approval (textgate), or an
   icon-only toggle.
2. Phone check: a real index build and a real multi-file ZIP on the Pixel 6a,
   and the haptic felt on long-press.
3. Optional: skeleton rows for the directory listing instead of "Loading…".

## done
Sound toggle exists on both surfaces and `flutter test` + `pnpm test` pass;
the phone check in 2 is reported by kuhy.

## verify
`cd app && flutter analyze && flutter test`; `pnpm --dir web test`; phone via
`~/.claude/scripts/phone_deploy.sh` (needs kuhy).

REMOVE ME AFTER FINISH
