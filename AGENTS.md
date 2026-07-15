# Public release gate

This repository is the personal `dicnunz` distribution of the Krea plugin for Codex. Do not present it as an official Krea product.

Before publishing a change:

1. Run `scripts/release-check.sh` on macOS.
2. Confirm `plugins/krea-ai/dist/krea-companion.mjs` and `THIRD_PARTY_NOTICES.txt` are regenerated and committed.
3. Install the marketplace from a clean Git clone with `codex plugin marketplace add <clone>` and `codex plugin add krea-ai@krea-codex`.
4. Exercise first-use OAuth with an empty credential namespace and confirm MCP `initialize` plus `tools/list` succeeds.
5. Run one complete generation-to-enhancement workflow using the installed plugin.
6. Verify the public README commands against the current default branch and supported Codex CLI.
7. Keep generated credentials, tokens, local Keychain data, `node_modules`, and build metadata out of Git.
