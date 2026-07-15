import assert from "node:assert/strict";
import test from "node:test";
import { forceAsyncArguments, sanitizeResult, sanitizeTool, waitForJob } from "../server/proxy-core.mjs";

test("submission tools are always asynchronous without mutating input", () => {
  const input = { sync: true, input: { prompt: "dog" } };
  const result = forceAsyncArguments("generate_image", input);
  assert.equal(result.sync, false);
  assert.equal(input.sync, true);
});

test("non-submission tool arguments are preserved", () => {
  assert.deepEqual(forceAsyncArguments("get_job", { jobId: "123" }), { jobId: "123" });
});

test("broken upstream widget metadata is removed", () => {
  const tool = sanitizeTool({
    name: "enhance_image",
    description: "Enhance",
    inputSchema: { type: "object" },
    _meta: { ui: { resourceUri: "ui://broken" }, "openai/outputTemplate": "ui://broken", keep: true }
  });
  assert.deepEqual(tool._meta, { keep: true });
  assert.match(tool.description, /always submits this asynchronously/);
});

test("result widget metadata is removed", () => {
  assert.deepEqual(sanitizeResult({ content: [], _meta: { ui: {} } }), { content: [] });
});

test("wait_for_job polls the same job until terminal", async () => {
  const statuses = ["queued", "processing", "completed"];
  const calls = [];
  const client = {
    async callTool(request) {
      calls.push(request);
      const status = statuses.shift();
      return { content: [{ type: "text", text: JSON.stringify({ job_id: "job-1", status }) }] };
    }
  };
  const result = await waitForJob(client, { jobId: "job-1", timeoutSeconds: 30, pollSeconds: 2 }, { sleep: async () => {} });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.arguments.jobId === "job-1"));
  assert.match(result.content[0].text, /completed/);
});
