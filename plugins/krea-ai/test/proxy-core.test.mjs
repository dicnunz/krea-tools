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

const jobResult = job => ({
  content: [{ type: "text", text: JSON.stringify(job) }],
  structuredContent: job
});

const fakeClock = () => {
  let time = 0;
  const sleeps = [];
  return {
    now: () => time,
    advance: ms => { time += ms; },
    sleep: async ms => { sleeps.push(ms); time += ms; },
    sleeps
  };
};

test("invalid wait arguments are rejected before contacting Krea", async t => {
  const cases = [
    ["missing arguments", undefined],
    ["null arguments", null],
    ["array arguments", []],
    ["string arguments", "job-1"],
    ["missing job ID", {}],
    ...["", " \n\t", 123, null].map(jobId => ["invalid job ID " + JSON.stringify(jobId), { jobId }]),
    ...[0, -1, 3601, 1.5, "10", null, NaN, Infinity].map(timeoutSeconds => [
      "invalid timeout " + String(timeoutSeconds), { jobId: "job-1", timeoutSeconds }
    ]),
    ...[0, 1, 61, 2.5, "2", null, NaN, Infinity].map(pollSeconds => [
      "invalid poll interval " + String(pollSeconds), { jobId: "job-1", pollSeconds }
    ]),
    ["unknown argument", { jobId: "job-1", sync: true }]
  ];
  for (const [name, args] of cases) {
    await t.test(name, async () => {
      let calls = 0;
      const client = { callTool: async () => { calls++; return jobResult({ status: "completed" }); } };
      await assert.rejects(waitForJob(client, args), TypeError);
      assert.equal(calls, 0);
    });
  }
});

test("wait accepts default settings and the documented numeric boundaries", async () => {
  const client = { callTool: async () => jobResult({ status: "completed" }) };
  for (const args of [
    { jobId: "job-1" },
    { jobId: "job-1", timeoutSeconds: 1, pollSeconds: 2 },
    { jobId: "job-1", timeoutSeconds: 3600, pollSeconds: 60 }
  ]) {
    assert.equal((await waitForJob(client, args)).structuredContent.status, "completed");
  }
});

test("every upstream terminal state ends polling and preserves the result", async t => {
  for (const status of ["completed", "failed", "cancelled", "canceled", "stalled", "timed_out", "timeout", " COMPLETED "]) {
    await t.test(status, async () => {
      const clock = fakeClock();
      const original = { ...jobResult({ job_id: "job-1", status, output: { url: "https://example.test/original.png" } }), _meta: { ui: {} } };
      let calls = 0;
      const client = { callTool: async () => { if (++calls > 1) throw new Error("Polled a terminal job twice"); return original; } };
      const result = await waitForJob(client, { jobId: "job-1" }, clock);
      assert.deepEqual(result, jobResult({ job_id: "job-1", status, output: { url: "https://example.test/original.png" } }));
      assert.deepEqual(clock.sleeps, []);
      assert.equal(calls, 1);
      assert.ok(original._meta);
    });
  }
});

test("a local deadline preserves the last job state without a poll at the deadline", async () => {
  const clock = fakeClock();
  const calls = [];
  const client = {
    callTool: async (request, schema, options) => {
      if (calls.length > 5) throw new Error("Polling exceeded the simulated deadline");
      calls.push({ request, timeout: options?.timeout });
      return jobResult({ job_id: "job-1", status: "queued", progress: 0 });
    }
  };
  const result = await waitForJob(client, { jobId: "job-1", timeoutSeconds: 5, pollSeconds: 2 }, clock);
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.status, "queued");
  assert.equal(result.structuredContent.progress, 0);
  assert.equal(result.structuredContent.waiting_timed_out, true);
  assert.deepEqual(result.structuredContent.resume, { tool: "wait_for_job", arguments: { jobId: "job-1" } });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.deepEqual(calls, [5000, 3000, 1000].map(timeout => ({ request: { name: "get_job", arguments: { jobId: "job-1" } }, timeout })));
  assert.deepEqual(clock.sleeps, [2000, 2000, 1000]);
});

test("a status request that exhausts the waiting window leaves the generation state unknown", async () => {
  const clock = fakeClock();
  const result = await waitForJob({ callTool: async () => {
    clock.advance(1000);
    throw new Error("Request timed out");
  } }, { jobId: "job-1", timeoutSeconds: 1 }, clock);
  assert.equal(result.structuredContent.job_id, "job-1");
  assert.equal(result.structuredContent.status, "unknown");
  assert.equal(result.structuredContent.waiting_timed_out, true);
  assert.equal(result.isError, undefined);
});

test("a network interruption retains the last known state and tells callers how to resume", async () => {
  const calls = [];
  const clock = fakeClock();
  const client = { callTool: async request => {
    calls.push(request);
    if (calls.length === 1) return jobResult({ status: "processing", progress: 40 });
    throw new Error("fetch failed: Authorization: Bearer private-test-token");
  } };
  const result = await waitForJob(client, { jobId: "job-1" }, clock);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.job_id, "job-1");
  assert.equal(result.structuredContent.status, "processing");
  assert.equal(result.structuredContent.progress, 40);
  assert.equal(result.structuredContent.waiting_interrupted, true);
  assert.equal(result.structuredContent.waiting_timed_out, undefined);
  assert.equal(result.structuredContent.waiting_error.code, "request_failed");
  assert.deepEqual(result.structuredContent.resume, { tool: "wait_for_job", arguments: { jobId: "job-1" } });
  assert.deepEqual(calls, Array.from({ length: 2 }, () => ({ name: "get_job", arguments: { jobId: "job-1" } })));
  assert.doesNotMatch(JSON.stringify(result), /private-test-token/);
  assert.match(result.structuredContent.message, /not resubmitted/);
});

test("upstream tool errors stop waiting without claiming that the job failed", async () => {
  let calls = 0;
  const result = await waitForJob({ callTool: async () => {
    calls++;
    return { isError: true, ...jobResult({ status: "completed", token: "private-test-token" }) };
  } }, { jobId: "job-1" }, fakeClock());
  assert.equal(calls, 1);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.status, "unknown");
  assert.equal(result.structuredContent.waiting_error.code, "upstream_error");
  assert.equal(result.structuredContent.waiting_interrupted, true);
  assert.doesNotMatch(JSON.stringify(result), /private-test-token/);
});

test("malformed status replies stop immediately and keep the existing job resumable", async t => {
  for (const [name, reply] of [
    ["missing reply", undefined],
    ["null reply", null],
    ["array reply", []],
    ["non-array content", { content: {} }],
    ["invalid JSON", { content: [{ type: "text", text: "not JSON" }] }],
    ["JSON scalar", { content: [{ type: "text", text: '"completed"' }] }],
    ["JSON array", { content: [{ type: "text", text: '[]' }] }],
    ["missing status", jobResult({ job_id: "job-1" })],
    ["null status", jobResult({ status: null })],
    ["object status", jobResult({ status: { state: "completed" } })],
    ["empty status", jobResult({ status: "   " })]
  ]) {
    await t.test(name, async () => {
      let calls = 0;
      const result = await waitForJob({ callTool: async () => {
        calls++;
        return calls === 1 ? reply : jobResult({ status: "completed" });
      } }, { jobId: "job-1" }, fakeClock());
      assert.equal(calls, 1);
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.status, "unknown");
      assert.equal(result.structuredContent.waiting_error.code, "invalid_response");
      assert.deepEqual(result.structuredContent.resume, { tool: "wait_for_job", arguments: { jobId: "job-1" } });
    });
  }
});
