## Commands

Four suites: `web/` (Astro, vitest), `app/` (Flutter), `firebase_backup/` (Python), `scripts/` (bats).

- deploy: `git -C ~/src/dufs-cloud pull --ff-only && ~/src/dufs-cloud/scripts/deploy.sh` (web build into the dufs cloud root + release APK onto the Pixel via phone_deploy; `scripts/deploy.sh web|phone` for one target; exits non-zero unless each health check passes)
- run: `pnpm --dir web dev`
- test: `scripts/test_changed.sh --all`
- test-changed: `scripts/test_changed.sh`
- lint: `pnpm --dir web run lint`
- coverage: `pnpm --dir web run coverage --coverage.reporter=lcov --coverage.reporter=text-summary`
- coverage-gaps: `coverage-gaps web/coverage/lcov.info`
