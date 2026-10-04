#!/bin/bash

# ============================================================================
# Run only the tests related to files changed vs HEAD (staged, unstaged and
# untracked). Quiet: failures plus a one-line summary. Four suites live here:
# web/ (vitest), app/ (flutter), firebase_backup/ (pytest), scripts/ (bats).
# A change that maps to no suite falls back to every suite. `--all` runs all.
# ============================================================================

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
CHANGED=()
while IFS= read -r f; do
    [[ -n "$f" && -e "$f" ]] && CHANGED+=("$f")
done < <({ git diff --name-only HEAD 2>/dev/null || true; git ls-files --others --exclude-standard; } | sort -u)

run_web() { pnpm --dir web exec vitest run --reporter=dot; }
run_web_related() { pnpm --dir web exec vitest related --run --reporter=dot "${@#web/}"; }
run_app() { (cd app && flutter test --reporter=failures-only "$@"); }
run_py_full() { python3 -m pytest -q --tb=short; }
run_py() { python3 -m pytest -q --tb=short --no-cov "$@"; }
run_bats() { bats scripts/tests >/dev/null; }

run_all() {
    local rc=0
    run_web || rc=1
    run_app || rc=1
    run_py_full || rc=1
    run_bats || rc=1
    return "$rc"
}

if [[ "${1:-}" == "--all" ]]; then run_all; exit $?; fi
if [[ ${#CHANGED[@]} -eq 0 ]]; then echo "no changes vs HEAD: nothing to test"; exit 0; fi

web_files=() app_files=() py_files=()
full_web=0 full_app=0 full_py=0 bats=0
for f in "${CHANGED[@]}"; do
    case "$f" in
        web/package.json | web/pnpm-lock.yaml | web/vite.config.ts | web/tsconfig.json) full_web=1 ;;
        web/src/*.ts | web/src/*.tsx) web_files+=("$f") ;;
        app/pubspec.yaml | app/pubspec.lock) full_app=1 ;;
        app/test/*_test.dart) app_files+=("${f#app/}") ;;
        app/lib/*.dart)
            rel="${f#app/lib/}"
            if [[ -f "app/test/${rel%.dart}_test.dart" ]]; then
                app_files+=("test/${rel%.dart}_test.dart")
            else
                full_app=1
            fi
            ;;
        pyproject.toml | firebase_backup/tests/conftest.py) full_py=1 ;;
        firebase_backup/tests/test_*.py) py_files+=("$f") ;;
        firebase_backup/*.py)
            t="firebase_backup/tests/test_$(basename "${f#firebase_backup/_}")"
            if [[ -f "$t" ]]; then py_files+=("$t"); else full_py=1; fi
            ;;
        scripts/*.sh | scripts/tests/*.bats) bats=1 ;;
    esac
done

if ! printf '%s\n' "${CHANGED[@]}" | grep -qE '^(web/|app/|firebase_backup/|scripts/|pyproject\.toml)'; then
    echo "no code changes: nothing to test"; exit 0
fi

rc=0
mapped=0
if [[ $full_web -eq 1 ]]; then mapped=1; run_web || rc=1
elif [[ ${#web_files[@]} -gt 0 ]]; then mapped=1; run_web_related "${web_files[@]}" || rc=1; fi
if [[ $full_app -eq 1 ]]; then mapped=1; run_app || rc=1
elif [[ ${#app_files[@]} -gt 0 ]]; then mapped=1; run_app "${app_files[@]}" || rc=1; fi
if [[ $full_py -eq 1 ]]; then mapped=1; run_py_full || rc=1
elif [[ ${#py_files[@]} -gt 0 ]]; then mapped=1; run_py "${py_files[@]}" || rc=1; fi
if [[ $bats -eq 1 ]]; then mapped=1; run_bats || rc=1; fi

if [[ $mapped -eq 0 ]]; then
    echo "no mapped tests: running full suite"
    run_all; exit $?
fi
exit "$rc"
