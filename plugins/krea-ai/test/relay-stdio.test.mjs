import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createRelayServer } from "../server/relay-stdio.mjs";

async function connectRelay(t, upstream) {
  const server = createRelayServer(upstream);
  const client = new Client({ name: "relay-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

test("MCP clients discover the local waiter and get input errors before upstream calls", async t => {
  const calls = [];
  const client = await connectRelay(t, {
    listTools: async () => ({ tools: [{
      name: "get_job", inputSchema: { type: "object" }, _meta: { ui: { resourceUri: "ui://broken" }, keep: true }
    }] }),
    callTool: async request => {
      calls.push(request);
      return { content: [], structuredContent: { job_id: "job-1", status: "completed" }, _meta: { ui: {} } };
    }
  });
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name), ["get_job", "wait_for_job"]);
  assert.deepEqual(listed.tools[0]._meta, { keep: true });
  await assert.rejects(client.callTool({ name: "wait_for_job", arguments: { jobId: "job-1", pollSeconds: 0 } }), error => {
    assert.equal(error.code, ErrorCode.InvalidParams);
    assert.match(error.message, /pollSeconds/);
    return true;
  });
  assert.deepEqual(calls, []);
  const result = await client.callTool({ name: "wait_for_job", arguments: { jobId: "job-1" } });
  assert.equal(result.structuredContent.status, "completed");
  assert.equal(result._meta, undefined);
  assert.deepEqual(calls, [{ name: "get_job", arguments: { jobId: "job-1" } }]);
});

test("MCP relay forces every submission family asynchronous and preserves each returned job ID", async t => {
  const calls = [];
  const client = await connectRelay(t, {
    callTool: async request => {
      calls.push(request);
      return { content: [], structuredContent: { job_id: `job-${request.name}`, status: "queued" } };
    }
  });
  for (const name of ["generate_image", "generate_video", "enhance_image", "execute_node_app"]) {
    const result = await client.callTool({ name, arguments: { sync: true, input: { prompt: "test" } } });
    assert.equal(result.structuredContent.job_id, `job-${name}`);
    assert.deepEqual(calls.at(-1), { name, arguments: { sync: false, input: { prompt: "test" } } });
  }
  assert.equal(calls.length, 4);
});
