#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
marketplace_source=${1:-$repo_root}
codex_bin=$(command -v codex)
test_home=$(mktemp -d "${TMPDIR:-/tmp}/krea-codex-install.XXXXXX")
cleanup() { rm -rf "$test_home"; }
trap cleanup EXIT HUP INT TERM

export CODEX_HOME="$test_home/codex-home"
mkdir -p "$CODEX_HOME"

"$codex_bin" plugin marketplace add "$marketplace_source"
"$codex_bin" plugin add krea-ai@krea-codex

plugin_root=$(find "$CODEX_HOME/plugins/cache/krea-codex/krea-ai" -mindepth 1 -maxdepth 1 -type d | head -n 1)
test -n "$plugin_root"
test -f "$plugin_root/.codex-plugin/plugin.json"
test -f "$plugin_root/assets/krea-composer.svg"
test -f "$plugin_root/assets/krea-logo.png"
test -x "$plugin_root/scripts/run-companion.sh"
test -f "$plugin_root/dist/krea-companion.mjs"
if [ ! -d "$marketplace_source" ]; then
  test ! -d "$plugin_root/node_modules"
fi

installed_version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$plugin_root/.codex-plugin/plugin.json" | head -n 1)
listed=$("$codex_bin" plugin list)
printf '%s\n' "$listed" | grep -F "krea-ai@krea-codex" >/dev/null
printf '%s\n' "$listed" | grep -F "installed, enabled  $installed_version" >/dev/null

PATH=/usr/bin:/bin:/usr/sbin:/sbin "$plugin_root/scripts/run-companion.sh" doctor

"$codex_bin" plugin remove krea-ai@krea-codex
"$codex_bin" plugin marketplace remove krea-codex
if "$codex_bin" plugin list | grep -F "krea-ai@krea-codex" >/dev/null; then
  echo "Krea plugin remained installed after removal" >&2
  exit 1
fi

echo "PASS clean marketplace install, cache, logo assets, bundled runtime, live discovery, and removal ($installed_version)"
