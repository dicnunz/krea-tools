import { PLUGIN_VERSION } from "./config.mjs";
import { connectUpstream } from "./upstream-client.mjs";

export function runtimeChecks({ platform = process.platform, nodeVersion = process.versions.node } = {}) {
  const supportedNode = Number(nodeVersion.split(".")[0]) >= 20;
  return [
    {
      id: "node", label: "Node.js", status: supportedNode ? "pass" : "fail",
      message: `Found ${nodeVersion}; requires Node.js 20 or newer.`,
      ...(!supportedNode ? { action: "Install Node.js 20 or newer, then start a new Codex task." } : {})
    },
    {
      id: "platform", label: "macOS Keychain", status: platform === "darwin" ? "pass" : "fail",
      message: platform === "darwin" ? "macOS supports the required credential store." : `The companion requires macOS; found ${platform}.`,
      ...(platform !== "darwin" ? { action: "Run the installed plugin on macOS with your login Keychain available." } : {})
    }
  ];
}

export function describeConnectionError(error) {
  // Inspect only to classify; upstream messages and stacks can contain OAuth data.
  const message = typeof error?.message === "string" ? error.message : "";
  if (message.startsWith("Krea authorization is required.") || error?.status === 401 || error?.code === 401) {
    return {
      code: "authorization_required", message: "Krea authorization is required or has expired.",
      action: "Run the companion's auth command on macOS, finish browser authorization, then run doctor again."
    };
  }
  if (message.startsWith("Unable to read Krea OAuth credentials from macOS Keychain:") || message.startsWith("Unable to save Krea OAuth credentials to macOS Keychain:")) {
    return {
      code: "keychain_unavailable", message: "The companion could not access macOS Keychain.",
      action: "Open Keychain Access, unlock your login Keychain, allow the companion access if prompted, then run doctor again."
    };
  }
  const networkCodes = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);
  if (message.startsWith("fetch failed") || networkCodes.has(error?.code) || networkCodes.has(error?.cause?.code)) {
    return {
      code: "network_unavailable", message: "The companion could not reach Krea.",
      action: "Check your network, proxy, and VPN settings and access to api.krea.ai and www.krea.ai, then run doctor again."
    };
  }
  return {
    code: "connection_failed",
    message: "The Krea connection could not complete.",
    action: "Check your network connection, then run the companion's auth command and try doctor again."
  };
}

class DoctorCheckError extends Error {
  constructor(code, message, action) {
    super(message);
    this.diagnostic = { code, message, action };
  }
}

function extractModels(result) {
  let payload = result?.structuredContent;
  if (payload === undefined && Array.isArray(result?.content)) {
    const text = result.content.find(item => item?.type === "text")?.text;
    if (typeof text !== "string") return undefined;
    try { payload = JSON.parse(text); } catch { return undefined; }
  }
  return Array.isArray(payload?.models) ? payload.models : undefined;
}

export async function runDoctor({
  connect = connectUpstream,
  platform = process.platform,
  nodeVersion = process.versions.node
} = {}) {
  const report = { ok: false, version: PLUGIN_VERSION, platform, nodeVersion, checks: runtimeChecks({ platform, nodeVersion }) };
  if (report.checks.some(check => check.status === "fail")) {
    report.checks.push({ id: "connection", label: "Krea connection", status: "skip", message: "Fix the local runtime requirements before checking Krea." });
    return report;
  }
  let client;
  let phase = { id: "connection", label: "Krea connection" };
  try {
    ({ client } = await connect({ interactive: false, openBrowser: false }));
    report.checks.push({ ...phase, status: "pass", message: "MCP initialization succeeded." });

    phase = { id: "tools", label: "Tool discovery" };
    const listed = await client.listTools();
    if (!Array.isArray(listed?.tools) || listed.tools.length === 0) {
      throw new DoctorCheckError("invalid_tool_list", "Krea returned no readable tool definitions.", "Try doctor again later; if this persists, update the plugin and check Krea service availability.");
    }
    report.checks.push({ ...phase, status: "pass", message: `${listed.tools.length} tools discovered.`, count: listed.tools.length });

    phase = { id: "models", label: "Model access" };
    const result = await client.callTool({ name: "list_models", arguments: {} });
    if (result?.isError) {
      throw new DoctorCheckError("model_access_failed", "Krea returned an error while listing models.", "Run the companion's auth command, confirm access to your Krea account, then run doctor again.");
    }
    const models = extractModels(result);
    if (!models?.length) {
      throw new DoctorCheckError("invalid_model_list", "Krea returned no readable models.", "Check model access in your Krea account and try doctor again later.");
    }
    report.checks.push({ ...phase, status: "pass", message: `${models.length} models are reachable.`, count: models.length });
  } catch (error) {
    report.checks.push({ ...phase, status: "fail", ...(error instanceof DoctorCheckError ? error.diagnostic : describeConnectionError(error)) });
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        report.checks.push({
          id: "cleanup", label: "Connection cleanup", status: "fail", code: "close_failed",
          message: "The diagnostic connection did not close cleanly.",
          action: "Run doctor again from a new terminal or Codex task."
        });
      }
    }
  }
  report.ok = report.checks.every(check => check.status === "pass");
  return report;
}

export function formatDoctorReport(report) {
  const lines = [`Krea companion ${report.version}`];
  for (const check of report.checks) {
    lines.push(`[${check.status.toUpperCase()}] ${check.label}: ${check.message}`);
    if (check.action) lines.push(`  Next: ${check.action}`);
  }
  lines.push(report.ok ? "Krea live check passed." : "Krea check did not pass; follow the steps above.");
  return lines.join("\n") + "\n";
}
