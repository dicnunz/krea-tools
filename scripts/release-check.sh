#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
plugin_root="$repo_root/plugins/krea-ai"

cd "$plugin_root"
npm ci
npm test
npm run test:live

cd "$repo_root"
git diff --exit-code -- plugins/krea-ai/dist/krea-companion.mjs plugins/krea-ai/THIRD_PARTY_NOTICES.txt

echo "Release checks passed."
