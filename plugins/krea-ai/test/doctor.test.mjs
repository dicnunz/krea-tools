import assert from "node:assert/strict";
import test from "node:test";
import { formatDoctorReport, runDoctor } from "../server/doctor.mjs";

function connection(overrides = {}) {
  const calls = [];
  const client = {
    listTools: async () => {
      calls.push("tools/list");
      return { tools: [{ name: "list_models", inputSchema: { type: "object" } }] };
    },
    callTool: async request => {
      calls.push(request);
      return { content: [], structuredContent: { models: [{ id: "model-1" }, { id: "model-2" }] } };
    },
    close: async () => { calls.push("close"); },
    ...overrides
  };
  return {
    calls,
    options: {
      platform: "darwin", nodeVersion: "20.20.0",
      connect: async options => { calls.push({ connect: options }); return { client }; }
    }
  };
}

test("doctor stops before connecting if either local requirement fails", async () => {
  for (const runtime of [{ platform: "linux", nodeVersion: "24.0.0" }, { platform: "darwin", nodeVersion: "18.0.0" }]) {
    let calls = 0;
    const report = await runDoctor({ ...runtime, connect: async () => { calls++; throw new Error("Unexpected network call"); } });
    assert.equal(calls, 0);
    assert.equal(report.ok, false);
    assert.equal(report.checks.find(check => check.id === "connection").status, "skip");
  }
});

test("doctor verifies discovery and model access without submitting jobs or opening a browser", async () => {
  const fake = connection();
  const report = await runDoctor(fake.options);
  assert.equal(report.ok, true);
  assert.equal(report.checks.find(check => check.id === "connection").status, "pass");
  assert.equal(report.checks.find(check => check.id === "tools").status, "pass");
  assert.equal(report.checks.find(check => check.id === "models").count, 2);
  assert.deepEqual(fake.calls, [
    { connect: { interactive: false, openBrowser: false } },
    "tools/list", { name: "list_models", arguments: {} }, "close"
  ]);
  assert.match(formatDoctorReport(report), /PASS.*Model access.*2/);
});

test("doctor accepts model lists encoded as MCP text content", async () => {
  const fake = connection({ callTool: async () => ({ content: [{ type: "text", text: '{"models":[{"id":"model-1"}]}' }] }) });
  const report = await runDoctor(fake.options);
  assert.equal(report.ok, true);
  assert.equal(report.checks.find(check => check.id === "models").count, 1);
});

test("doctor provides targeted guidance without disclosing connection error details", async t => {
  for (const [name, error, code, action] of [
    ["authorization", new Error("Krea authorization is required. private-test-token"), "authorization_required", /auth/],
    ["Keychain", new Error("Unable to read Krea OAuth credentials from macOS Keychain: private-test-token"), "keychain_unavailable", /Keychain Access/],
    ["network", new TypeError("fetch failed: private-test-token", { cause: { code: "ENOTFOUND" } }), "network_unavailable", /network|proxy|VPN/],
    ["unexpected", new Error("private-test-token"), "connection_failed", /doctor/]
  ]) {
    await t.test(name, async () => {
      const report = await runDoctor({ platform: "darwin", nodeVersion: "20.0.0", connect: async () => { throw error; } });
      assert.equal(report.ok, false);
      const check = report.checks.find(check => check.id === "connection");
      assert.equal(check.status, "fail");
      assert.equal(check.code, code);
      assert.match(check.action, action);
      assert.doesNotMatch(JSON.stringify(report) + formatDoctorReport(report), /private-test-token|\n\s+at /);
    });
  }
});

test("failed tool discovery is identified and the client is closed", async () => {
  const fake = connection({ listTools: async () => { throw new Error("private-test-token"); } });
  const report = await runDoctor(fake.options);
  assert.equal(report.ok, false);
  assert.equal(report.checks.find(check => check.id === "connection").status, "pass");
  assert.equal(report.checks.find(check => check.id === "tools").status, "fail");
  assert.equal(fake.calls.at(-1), "close");
  assert.equal(fake.calls.some(call => call?.name === "list_models"), false);
});

test("an empty or malformed tool list cannot pass doctor", async t => {
  for (const [name, reply] of [["empty", { tools: [] }], ["missing", {}], ["wrong type", { tools: "not-tools" }]]) {
    await t.test(name, async () => {
      const fake = connection({ listTools: async () => reply });
      const report = await runDoctor(fake.options);
      assert.equal(report.ok, false);
      assert.equal(report.checks.find(check => check.id === "tools").status, "fail");
      assert.equal(fake.calls.at(-1), "close");
    });
  }
});

test("model errors and invalid model lists fail the model check and close the client", async t => {
  for (const [name, reply] of [
    ["upstream error", { isError: true, content: [{ type: "text", text: "private-test-token" }], structuredContent: { models: [{ id: "model-1" }] } }],
    ["empty models", { content: [], structuredContent: { models: [] } }],
    ["string models", { content: [], structuredContent: { models: "not-models" } }],
    ["unreadable content", { content: [{ type: "text", text: "private-test-token" }] }],
    ["null content", { content: null }]
  ]) {
    await t.test(name, async () => {
      const fake = connection({ callTool: async () => reply });
      const report = await runDoctor(fake.options);
      assert.equal(report.ok, false);
      assert.equal(report.checks.find(check => check.id === "models").status, "fail");
      assert.equal(fake.calls.at(-1), "close");
      assert.doesNotMatch(JSON.stringify(report) + formatDoctorReport(report), /private-test-token/);
    });
  }
});

test("a failed model request still closes the client", async () => {
  const fake = connection({ callTool: async () => { throw new Error("private-test-token"); } });
  const report = await runDoctor(fake.options);
  assert.equal(report.ok, false);
  assert.equal(report.checks.find(check => check.id === "models").status, "fail");
  assert.equal(fake.calls.at(-1), "close");
});

test("cleanup failures are reported separately without hiding successful checks", async () => {
  const fake = connection({ close: async () => { throw new Error("private-test-token"); } });
  const report = await runDoctor(fake.options);
  assert.equal(report.ok, false);
  assert.equal(report.checks.find(check => check.id === "models").status, "pass");
  assert.equal(report.checks.find(check => check.id === "cleanup").status, "fail");
  assert.doesNotMatch(JSON.stringify(report) + formatDoctorReport(report), /private-test-token/);
});
