#!/usr/bin/env node
import { connectUpstream } from "./upstream-client.mjs";
import { serveStdio } from "./relay-stdio.mjs";

const command = process.argv[2] ?? "stdio";

if (process.platform !== "darwin") {
  throw new Error("Krea for Codex currently supports macOS because OAuth credentials are stored in Apple Keychain.");
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) throw new Error(`Krea for Codex requires Node.js 20 or newer; found ${process.versions.node}.`);

try {
  if (command === "auth") {
    const { client } = await connectUpstream({ interactive: true, openBrowser: !process.argv.includes("--no-open") });
    const models = await client.callTool({ name: "list_models", arguments: {} });
    const count = models?.structuredContent?.models?.length ?? "available";
    process.stdout.write(`Krea authorization succeeded; ${count} models are reachable.\n`);
    await client.close();
  } else if (command === "doctor") {
    const { client } = await connectUpstream();
    const models = await client.callTool({ name: "list_models", arguments: {} });
    const count = models?.structuredContent?.models?.length ?? 0;
    if (!count) throw new Error("Krea connected but returned no models.");
    process.stdout.write(`Krea live check passed; ${count} models are reachable.\n`);
    await client.close();
  } else if (command === "stdio") {
    const { client } = await connectUpstream({ interactive: true, openBrowser: !process.argv.includes("--no-open") });
    await serveStdio(client);
  } else {
    throw new Error(`Unknown command: ${command}. Use auth, doctor, or stdio.`);
  }
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
