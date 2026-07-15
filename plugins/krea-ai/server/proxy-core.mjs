import { SUBMISSION_TOOLS, TERMINAL_STATUSES } from "./config.mjs";

const UI_META_KEYS = new Set(["ui", "openai/outputTemplate", "openai/widgetAccessible", "openai/resultCanProduceWidget"]);

export function sanitizeTool(tool) {
  const clean = structuredClone(tool);
  if (clean._meta) {
    for (const key of Object.keys(clean._meta)) {
      if (UI_META_KEYS.has(key) || key.startsWith("ui/")) delete clean._meta[key];
    }
    if (Object.keys(clean._meta).length === 0) delete clean._meta;
  }
  if (SUBMISSION_TOOLS.has(clean.name)) {
    clean.description = `${clean.description ?? "Submit a Krea job."} The local companion always submits this asynchronously. Save the returned job ID, then call wait_for_job before using its output in another stage.`;
  }
  return clean;
}

export function forceAsyncArguments(name, args = {}) {
  if (!SUBMISSION_TOOLS.has(name)) return structuredClone(args);
  return { ...structuredClone(args), sync: false };
}

export function sanitizeResult(result) {
  const clean = structuredClone(result);
  if (clean._meta) delete clean._meta;
  return clean;
}

export const waitForJobTool = {
  name: "wait_for_job",
  title: "Wait for Krea job",
  description: "Poll one existing Krea job until it completes, fails, is cancelled, or reaches a caller-defined waiting limit. This never resubmits the job.",
  inputSchema: {
    type: "object",
    properties: {
      jobId: { type: "string", description: "Job ID returned by a Krea submission tool" },
      timeoutSeconds: { type: "integer", minimum: 1, maximum: 3600, default: 900 },
      pollSeconds: { type: "integer", minimum: 2, maximum: 60, default: 10 }
    },
    required: ["jobId"],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
};

const extractJob = result => result?.structuredContent ?? (() => {
  const text = result?.content?.find(item => item.type === "text")?.text;
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
})();

export async function waitForJob(client, { jobId, timeoutSeconds = 900, pollSeconds = 10 }, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const started = Date.now();
  const deadline = started + timeoutSeconds * 1000;
  let latest;
  while (Date.now() <= deadline) {
    latest = sanitizeResult(await client.callTool({ name: "get_job", arguments: { jobId } }));
    const job = extractJob(latest);
    const status = String(job?.status ?? "unknown").toLowerCase();
    if (TERMINAL_STATUSES.has(status)) return latest;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(pollSeconds * 1000, remaining));
  }
  const job = extractJob(latest) ?? { job_id: jobId, status: "processing" };
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ...job,
        waiting_timed_out: true,
        message: "The local waiting window ended, but the Krea job was not resubmitted. Call wait_for_job again with the same jobId to resume."
      }, null, 2)
    }],
    structuredContent: { ...job, waiting_timed_out: true }
  };
}
