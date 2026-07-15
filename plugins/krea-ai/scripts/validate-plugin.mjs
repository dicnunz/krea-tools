import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const marketplaceRoot = path.resolve(root, "../..");
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const marketplace = JSON.parse(await readFile(path.join(marketplaceRoot, ".agents/plugins/marketplace.json"), "utf8"));

const manifest = await readJson(".codex-plugin/plugin.json");
const app = await readJson(".app.json");
const mcp = await readJson(".mcp.json");
const pkg = await readJson("package.json");

assert.equal(manifest.name, "krea-ai");
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.apps, "./.app.json");
assert.equal(manifest.mcpServers, "./.mcp.json");
assert.match(app.apps.krea.id, /^asdk_app_[a-f0-9]+$/);
assert.equal(mcp.mcpServers["krea-ai"].command, "/bin/sh");
assert.equal(mcp.mcpServers["krea-ai"].cwd, ".");
assert.deepEqual(mcp.mcpServers["krea-ai"].args, ["./scripts/run-companion.sh", "stdio"]);
assert.equal(marketplace.name, "krea-codex");
const marketplacePlugin = marketplace.plugins.find(plugin => plugin.name === "krea-ai");
assert.ok(marketplacePlugin);
assert.equal(marketplacePlugin.source.path, "./plugins/krea-ai");
assert.equal(marketplacePlugin.policy.installation, "AVAILABLE");
assert.equal(marketplacePlugin.policy.authentication, "ON_INSTALL");

for (const file of [
  manifest.skills,
  manifest.mcpServers,
  manifest.apps,
  manifest.interface.composerIcon,
  manifest.interface.logo,
  "skills/krea-workflows/SKILL.md",
  "skills/krea-workflows/references/workflows.md",
  "server/cli.mjs",
  "server/relay-stdio.mjs",
  "dist/krea-companion.mjs",
  "scripts/run-companion.sh",
  "LICENSE",
  "THIRD_PARTY_NOTICES.txt",
  "../../README.md",
  "../../LICENSE"
]) {
  await access(path.join(root, file));
}

const unauthenticated = await fetch("https://api.krea.ai/mcp", { redirect: "manual" });
assert.equal(unauthenticated.status, 401);
const challenge = unauthenticated.headers.get("www-authenticate") ?? "";
assert.match(challenge, /Bearer/i);
assert.match(challenge, /resource_metadata="https:\/\/www\.krea\.ai\/\.well-known\/oauth-protected-resource"/);

const protectedMetadata = await fetch("https://www.krea.ai/.well-known/oauth-protected-resource").then((r) => {
  assert.equal(r.status, 200);
  return r.json();
});
assert.equal(protectedMetadata.resource, "https://api.krea.ai/mcp");
assert.ok(protectedMetadata.authorization_servers.includes("https://www.krea.ai"));

const oauthMetadata = await fetch("https://www.krea.ai/.well-known/oauth-authorization-server").then((r) => {
  assert.equal(r.status, 200);
  return r.json();
});
assert.equal(oauthMetadata.issuer, "https://www.krea.ai");
assert.ok(oauthMetadata.code_challenge_methods_supported.includes("S256"));
assert.ok(oauthMetadata.grant_types_supported.includes("authorization_code"));
assert.ok(oauthMetadata.grant_types_supported.includes("refresh_token"));
assert.ok(oauthMetadata.registration_endpoint);

const bundled = await readFile(path.join(root, "dist/krea-companion.mjs"), "utf8");
assert.match(bundled, /Krea authorization succeeded/);
assert.ok(Buffer.byteLength(bundled) > 100_000, "bundled runtime is unexpectedly small");

console.log("PASS marketplace, plugin manifest, self-contained runtime, assets, MCP challenge, and OAuth discovery metadata");
