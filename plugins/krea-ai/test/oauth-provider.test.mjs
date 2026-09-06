import assert from "node:assert/strict";
import test from "node:test";
import { PersistentOAuthProvider } from "../server/oauth-provider.mjs";

test("noninteractive diagnostics can suppress authorization URLs", async t => {
  let output = "";
  t.mock.method(process.stderr, "write", chunk => { output += chunk; return true; });
  const provider = new PersistentOAuthProvider({}, { openBrowser: false, displayAuthorizationUrl: false });
  const url = new URL("https://example.test/authorize?state=private-test-state");
  await provider.redirectToAuthorization(url);
  assert.equal(output, "");
  assert.equal(provider.pendingAuthorizationUrl, url);
});

test("manual interactive authorization still displays its URL", async t => {
  let output = "";
  t.mock.method(process.stderr, "write", chunk => { output += chunk; return true; });
  const provider = new PersistentOAuthProvider({}, { openBrowser: false });
  await provider.redirectToAuthorization(new URL("https://example.test/authorize"));
  assert.match(output, /KREA_AUTH_URL=https:\/\/example.test\/authorize/);
});
