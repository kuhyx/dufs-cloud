# dufs-cloud motion: context

## context you would otherwise rediscover

- **Prompt 07 must have run first.** Until it does, `app/` has no
  `design_system` dependency and hand-restates the palette in
  `app/lib/ui/theme.dart`.
- Web tokens come from `@kuhyx/web-ui` imported in `web/src/main.tsx`;
  `web/src/index.css` declares only `--overlay`. New tokens arrive **only** after
  the tag bump — this is the step that is easy to forget and silently produces
  "the variable doesn't exist".
- `upload()` uses a non-streaming `_http.put`, so real byte-level upload progress
  needs a `StreamedRequest` refactor. That may be more than this prompt wants —
  if you skip it, say so explicitly and report per-**file** progress instead of
  per-byte rather than faking a byte percentage.
- Media playback (`web/src/hooks/use-dash-player.ts`, `web/src/lib/dash-buffer.ts`,
  `app/lib/services/app_player.dart`) has its own buffering states. Out of scope
  unless trivially adjacent.

