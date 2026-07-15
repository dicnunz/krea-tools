#!/bin/sh
set -eu

if command -v node >/dev/null 2>&1; then
  node_bin=$(command -v node)
elif [ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "Krea for Codex requires Node.js 20 or newer. Install Node.js, then start a new Codex task." >&2
  exit 1
fi

exec "$node_bin" ./dist/krea-companion.mjs "$@"
