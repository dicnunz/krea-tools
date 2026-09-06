import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const run = (...args) => spawnSync(process.execPath, ["server/cli.mjs", ...args], {
  cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 5000
});

test("help works without contacting Krea on every platform", () => {
  const result = run("--help");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /doctor.*--json/);
  assert.match(result.stdout, /auth.*--no-open/);
  assert.equal(result.stderr, "");
});

test("unknown commands give usage without echoing untrusted arguments", () => {
  const result = run("private-test-token");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command/);
  assert.match(result.stderr, /auth|doctor|stdio/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-test-token|file:\/\/|\n\s+at /);
});

test("unsupported doctor options stop before contacting Krea", () => {
  const result = run("doctor", "--unknown=private-test-token");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /doctor.*--json/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-test-token|file:\/\/|\n\s+at /);
});

test("doctor reports unsupported platforms without a stack trace", { skip: process.platform === "darwin" }, () => {
  const result = run("doctor");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL.*macOS/);
  assert.match(result.stderr, /SKIP.*Krea/);
  assert.doesNotMatch(result.stdout + result.stderr, /file:\/\/|\n\s+at /);
});

test("doctor JSON is valid even when the runtime is unsupported", { skip: process.platform === "darwin" }, () => {
  const result = run("doctor", "--json");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.platform, process.platform);
  assert.equal(report.checks.find(check => check.id === "platform").status, "fail");
  assert.equal(report.checks.find(check => check.id === "connection").status, "skip");
});
