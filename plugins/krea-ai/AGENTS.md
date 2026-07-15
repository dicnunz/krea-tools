# Krea plugin release gate

Before changing or releasing this plugin:

1. Keep the Codex stdio relay and marketplace entry valid together.
2. Keep the committed `dist/krea-companion.mjs` self-contained; installation must not require `npm install`.
3. First launch must support Krea OAuth without an API key and store credentials only in macOS Keychain.
4. Submit generation, video, enhancement, and node-app jobs asynchronously; never convert a polling deadline into a failed job or duplicate submission.
5. Do not publish unless `npm test`, `npm run test:live`, a clean Git marketplace install, first-use OAuth, and one complete generation-to-enhancement workflow pass.
6. The public README must match the exact tested commands and supported platforms.
