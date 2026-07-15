import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { forceAsyncArguments, sanitizeResult, sanitizeTool, waitForJob, waitForJobTool } from "./proxy-core.mjs";

export function createRelayServer(upstream) {
  const server = new Server({ name: "krea-local-companion", version: "0.4.2" }, {
    capabilities: { tools: {} },
    instructions: "Use Krea submission tools asynchronously, preserve each returned job ID, and call wait_for_job before chaining the resulting original asset into another stage."
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const listed = await upstream.listTools();
    return { ...listed, tools: [...listed.tools.map(sanitizeTool), waitForJobTool] };
  });

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args = {} } = request.params;
    if (name === waitForJobTool.name) return waitForJob(upstream, args);
    return sanitizeResult(await upstream.callTool({ name, arguments: forceAsyncArguments(name, args) }));
  });

  return server;
}

export async function serveStdio(upstream) {
  const server = createRelayServer(upstream);
  await server.connect(new StdioServerTransport());
  return server;
}
