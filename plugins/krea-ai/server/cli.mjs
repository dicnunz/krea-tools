#!/usr/bin/env node
import { connectUpstream } from "./upstream-client.mjs";
import { serveStdio } from "./relay-stdio.mjs";
import { describeConnectionError, formatDoctorReport, runDoctor, runtimeChecks } from "./doctor.mjs";

const command = process.argv[2] ?? "stdio";
const options = process.argv.slice(3);
const usage = "Usage: krea-companion.mjs auth [--no-open] | doctor [--json] | stdio [--no-open]\n";

async function main() {
  if (command === "--help" || command === "help" || command === "-h") {
    process.stdout.write(usage);
    return;
  }
  if (!["auth", "doctor", "stdio"].includes(command)) {
    process.stderr.write(`Unknown command. ${usage}`);
    process.exitCode = 1;
    return;
  }
  if (options.some(option => option !== (command === "doctor" ? "--json" : "--no-open"))) {
    process.stderr.write(`Unsupported option. ${usage}`);
    process.exitCode = 1;
    return;
  }
  if (command === "doctor") {
    const report = await runDoctor();
    const json = options.includes("--json");
    const output = json || report.ok ? process.stdout : process.stderr;
    output.write(json ? JSON.stringify(report, null, 2) + "\n" : formatDoctorReport(report));
    process.exitCode = report.ok ? 0 : 1;
    return;
  }
  const failures = runtimeChecks().filter(check => check.status === "fail");
  if (failures.length) {
    for (const check of failures) process.stderr.write(`${check.message} ${check.action}\n`);
    process.exitCode = 1;
    return;
  }
  const { client } = await connectUpstream({ interactive: true, openBrowser: !options.includes("--no-open") });
  if (command === "auth") {
    try {
      const models = await client.callTool({ name: "list_models", arguments: {} });
      const count = models?.structuredContent?.models?.length ?? "available";
      process.stdout.write(`Krea authorization succeeded; ${count} models are reachable.\n`);
    } finally {
      await client.close();
    }
  } else {
    await serveStdio(client);
  }
}

try {
  await main();
} catch (error) {
  const diagnostic = describeConnectionError(error);
  process.stderr.write(`${diagnostic.message}\nNext: ${diagnostic.action}\n`);
  process.exitCode = 1;
}
