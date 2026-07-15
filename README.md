# Krea for Codex

Use Krea directly from Codex to discover live models, generate and edit images, create video, apply your LoRAs, enhance and upscale assets, and safely wait for long-running jobs.

The plugin uses your normal Krea account through OAuth and generations consume that account's usual plan and credits. It does not require a Krea API key, separate API billing, or a hosted relay.

## Install

Requirements: the Codex desktop app or CLI with plugins enabled and macOS. The launcher uses Node.js 20+ from your PATH or Codex's bundled runtime.

```sh
codex plugin marketplace add dicnunz/krea-codex-plugin
codex plugin add krea-ai@krea-codex
```

Quit and reopen Codex after installation, then start a new task and ask it to use Krea. The installed plugin should appear as **Krea** with the black Krea logo—not Codex's generic light-bulb placeholder. On first use, your browser opens Krea's authorization page. Approve **Krea Local Companion** once; the OAuth credentials are then stored in your macOS Keychain.

If Codex was already open while you installed the plugin, the restart is required for its tools, skill, and logo to load into a fresh task.

Example:

> Use Krea to generate a cinematic image of a rabbit running through snow, enhance it 2×, and animate it with Omni Flash.

## What the plugin does

- Reads Krea's live model schemas instead of relying on stale parameter lists.
- Uses the LoRAs and styles available to your authenticated Krea account.
- Forces generation and enhancement submissions into asynchronous mode.
- Preserves job IDs and exposes `wait_for_job`, preventing accidental duplicate generations when a model takes longer than a client polling window.
- Runs locally and forwards tool calls directly to `https://api.krea.ai/mcp`.
- Stores OAuth credentials in macOS Keychain under `ai.krea.local-companion`; credentials are never written into the repository.

## Troubleshooting

If **Krea** shows a generic light-bulb icon, update the marketplace and reinstall the plugin, then fully quit and reopen Codex:

```sh
codex plugin marketplace upgrade krea-codex
codex plugin add krea-ai@krea-codex
```

Confirm that `codex plugin list` reports `krea-ai@krea-codex` as installed and enabled.

If authorization did not finish during first launch, run the bundled companion directly and then start a new Codex task:

```sh
node ~/.codex/plugins/cache/krea-codex/krea-ai/*/dist/krea-companion.mjs auth
```

If that path differs on your Codex version, run `codex plugin list` to locate the installed marketplace and plugin.

To remove the plugin:

```sh
codex plugin remove krea-ai@krea-codex
codex plugin marketplace remove krea-codex
```

## Development and verification

```sh
cd plugins/krea-ai
npm ci
npm test
npm run test:live
```

`npm test` builds the self-contained runtime, runs unit tests, validates the Codex marketplace and plugin manifests, checks referenced assets, and verifies Krea's production OAuth discovery metadata. `npm run test:live` additionally uses the current macOS Keychain authorization to verify live model access.

This is a community-built integration and is not an official Krea product. Krea names and marks belong to their respective owners.
