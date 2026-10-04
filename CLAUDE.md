## Commands

Four suites: `web/` (React, vitest), `app/` (Flutter), `firebase_backup/` (Python), `scripts/` (bats).

- run: `pnpm --dir web dev`
- test: `scripts/test_changed.sh --all`
- test-changed: `scripts/test_changed.sh`
- lint: `pnpm --dir web run lint`
- coverage: `pnpm --dir web run coverage --coverage.reporter=lcov --coverage.reporter=text-summary`
- coverage-gaps: `coverage-gaps web/coverage/lcov.info`
