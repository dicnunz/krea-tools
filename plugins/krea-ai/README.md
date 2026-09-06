# Krea plugin package

This directory contains the installable `krea-ai` Codex plugin. Public installation and usage instructions live in the repository root [README](../../README.md).

The committed `dist/krea-companion.mjs` is the runtime used by Codex. Contributors can regenerate it with `npm ci && npm run build`.

From this directory, inspect the companion's commands with `node dist/krea-companion.mjs --help`. On macOS, run `node dist/krea-companion.mjs doctor` for readable diagnostics or add `--json` for a structured report. Diagnostic failures use fixed messages and suggested recovery steps; raw OAuth errors and authorization URLs are omitted.

`npm run test:unit` needs the development dependencies but makes no network requests and does not access Keychain. The polling tests use a deterministic clock. `npm test` retains the production OAuth discovery checks; passing unit tests alone is not a release gate.

`wait_for_job` accepts a non-empty `jobId`, an integer `timeoutSeconds` from 1 to 3600 (default 900), and an integer `pollSeconds` from 2 to 60 (default 10). A local timeout returns `waiting_timed_out: true`. An interrupted status read returns `isError: true` with `waiting_interrupted: true` and a diagnostic code in `waiting_error`; that error describes the wait operation, not the generation. Both responses preserve the last known state and include a `resume` call for the existing job. Only an upstream terminal job status ends the wait as a terminal generation result.
