#!/bin/bash
# deploy.sh — deploy this checkout everywhere it runs, then prove it landed.
#
#   deploy.sh [all|web|phone]   (default: all)
#
# web:   build web/ and copy dist/ into the dufs cloud root. dufs serves the
#        files straight from disk, so no restart. Check: dufs.service active,
#        dufs answers on 127.0.0.1:5000 (200 or the auth gate's 401), the served
#        index.html is byte-equal to the build and every asset it names exists.
# phone: release build + `adb install -r` of app/ onto the Pixel through
#        phone_deploy.sh (no uninstall, no pm clear: that script has neither).
#        Check: the package's lastUpdateTime is newer than this run's start on
#        the phone's clock, and the app is running after the launch.
#
# Idempotent: a rerun rebuilds and re-copies the same bytes. Exits non-zero on
# the first failed step or check; prints one OK line per verified target.

set -euo pipefail

HERE="$(dirname "$(readlink -f "$0")")"
readonly HERE
readonly REPO_ROOT="${HERE%/scripts}"
readonly WEB="$REPO_ROOT/web"
readonly APP="$REPO_ROOT/app"
readonly DUFS_YAML="$HOME/.config/dufs/dufs.yaml"
readonly DUFS_URL="${DUFS_URL:-http://127.0.0.1:5000/}"
readonly PKG="com.kuhy.dufs_client"
readonly SERIAL="${ADB_SERIAL:-23181JEGR08034}"
readonly PHONE_DEPLOY="${PHONE_DEPLOY:-$HOME/.claude/scripts/phone_deploy.sh}"
# Ship's PATH puts an old nvm node first; the system (pacman) node is the one
# kept at CI's pin, so the web build runs with it first on PATH.
readonly NODE_BIN_DIR="${NODE_BIN_DIR:-/usr/bin}"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] FAIL: %s\n' "$*" >&2; exit 1; }

cloud_root() {
	local sp=""
	[[ -f "$DUFS_YAML" ]] && sp="$(sed -nE 's/^serve-path:[[:space:]]*//p' "$DUFS_YAML" | head -1)"
	printf '%s' "${sp:-$HOME/data/cloud}"
}

# Copy dist/ in. New assets land beside the old ones and index.html goes last,
# so a page loaded mid-deploy never points at a missing file.
publish_web() {
	local root="$1" dist="$WEB/dist"
	mkdir -p "$root/assets"
	cp -r "$dist/assets/." "$root/assets/"
	cp -f "$dist/index.html" "$root/index.html.new"
	mv -f "$root/index.html.new" "$root/index.html"
	# Drop assets the new build no longer ships (old hashed bundles).
	local f
	for f in "$root/assets"/*; do
		[[ -e "$dist/assets/${f##*/}" ]] || rm -rf -- "$f"
	done
}

check_web() {
	local root="$1" code ref
	systemctl is-active --quiet dufs.service || die "dufs.service is not active"
	code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$DUFS_URL" || true)"
	[[ $code == 200 || $code == 401 ]] || die "dufs at $DUFS_URL answered '$code', want 200 or 401"
	cmp -s "$WEB/dist/index.html" "$root/index.html" || die "served index.html differs from the build"
	while read -r ref; do
		[[ -f "$root/$ref" ]] || die "index.html names $ref, missing from $root"
	done < <(grep -oE '/assets/[^"'"'"' )>]+' "$root/index.html" | sed 's#^/##' | sort -u)
	log "OK web: $(sha256sum "$root/index.html" | cut -c1-12) served from $root"
}

# Fail before building unless the node in NODE_BIN_DIR has CI's major.
use_pinned_node() {
	local pin have
	pin="$(sed -nE 's/^[[:space:]]*node-version:[[:space:]]*"?([0-9][0-9.]*)"?.*/\1/p' \
		"$REPO_ROOT/.github/workflows/ci.yml" | head -1)"
	[[ -n $pin ]] || die "no node-version pin in .github/workflows/ci.yml"
	export PATH="$NODE_BIN_DIR:$PATH"
	have="$(node -v)"
	[[ ${have#v} == "${pin%%.*}".* ]] || die "node $have in $NODE_BIN_DIR, CI pins $pin: upgrade node"
}

deploy_web() {
	local root; root="$(cloud_root)"
	use_pinned_node
	log "web: build (node $(node -v))"
	pnpm --dir "$WEB" install --frozen-lockfile
	pnpm --dir "$WEB" run build
	[[ -f "$WEB/dist/index.html" ]] || die "build produced no $WEB/dist/index.html"
	publish_web "$root"
	check_web "$root"
}

phone_now() { adb -s "$SERIAL" shell date "'+%Y-%m-%d %H:%M:%S'" | tr -d '\r'; }

deploy_phone() {
	local start updated rc=0
	start="$(phone_now)" || die "phone $SERIAL unreachable"
	[[ -n $start ]] || die "phone $SERIAL gave no clock"
	log "phone: release build + install ($PKG on $SERIAL)"
	ADB_SERIAL="$SERIAL" "$PHONE_DEPLOY" "$APP" --release || rc=$?
	((rc == 0)) || die "phone_deploy.sh exited $rc"
	updated="$(adb -s "$SERIAL" shell dumpsys package "$PKG" \
		| sed -nE 's/^[[:space:]]*lastUpdateTime=//p' | head -1 | tr -d '\r')"
	[[ -n $updated && ! $updated < $start ]] \
		|| die "$PKG lastUpdateTime '$updated' is older than this run ($start)"
	[[ -n "$(adb -s "$SERIAL" shell pidof "$PKG" | tr -d '\r')" ]] \
		|| die "$PKG is not running after the launch"
	log "OK phone: $PKG installed $updated and running"
}

main() {
	local target="${1:-all}"
	case "$target" in
		# Subshell: use_pinned_node's PATH must not reach the phone build
		# (/usr/bin holds a different flutter than ~/.local/bin).
		all) (deploy_web); deploy_phone ;;
		web) deploy_web ;;
		phone) deploy_phone ;;
		*) printf 'usage: %s [all|web|phone]\n' "$0" >&2; exit 2 ;;
	esac
}

main "$@"
