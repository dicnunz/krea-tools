#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
plugin_root=$(dirname "$script_dir")

if command -v node >/dev/null 2>&1; then
  node_bin=$(command -v node)
elif [ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "Krea for Codex requires Node.js 20 or newer. Install Node.js, then start a new Codex task." >&2
  exit 1
fi

exec "$node_bin" "$plugin_root/dist/krea-companion.mjs" "$@"
