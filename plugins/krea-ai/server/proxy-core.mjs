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
      jobId: { type: "string", minLength: 1, pattern: "\\S", description: "Job ID returned by a Krea submission tool" },
      timeoutSeconds: { type: "integer", minimum: 1, maximum: 3600, default: 900 },
      pollSeconds: { type: "integer", minimum: 2, maximum: 60, default: 10 }
    },
    required: ["jobId"],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
};

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

export class InvalidWaitArgumentsError extends TypeError {}

function validateWaitArguments(args) {
  if (!isRecord(args)) throw new InvalidWaitArgumentsError("wait_for_job requires an arguments object with a jobId.");
  if (Object.keys(args).some(key => !Object.hasOwn(waitForJobTool.inputSchema.properties, key))) {
    throw new InvalidWaitArgumentsError("wait_for_job accepts only jobId, timeoutSeconds, and pollSeconds.");
  }
  if (typeof args.jobId !== "string" || !args.jobId.trim()) {
    throw new InvalidWaitArgumentsError("jobId must be a non-empty string returned by a Krea submission tool.");
  }
  for (const key of ["timeoutSeconds", "pollSeconds"]) {
    const { minimum, maximum } = waitForJobTool.inputSchema.properties[key];
    if (args[key] !== undefined && (!Number.isInteger(args[key]) || args[key] < minimum || args[key] > maximum)) {
      throw new InvalidWaitArgumentsError(`${key} must be an integer from ${minimum} to ${maximum}.`);
    }
  }
}

function extractJob(result) {
  if (!isRecord(result)) return undefined;
  let job = result.structuredContent;
  if (job === undefined && Array.isArray(result.content)) {
    const text = result.content.find(item => item?.type === "text")?.text;
    if (typeof text !== "string") return undefined;
    try { job = JSON.parse(text); } catch { return undefined; }
  }
  return isRecord(job) && typeof job.status === "string" && job.status.trim() ? job : undefined;
}

const WAIT_ERRORS = {
  request_failed: "The get_job request could not complete. Check the connection and authorization before resuming.",
  upstream_error: "Krea returned a tool error for get_job. Check authorization with the companion's doctor command before resuming.",
  invalid_response: "Krea returned an unreadable job status. Resume later with the same jobId; the job's current state could not be confirmed."
};

function resumableWaitResult(jobId, job, errorCode) {
  const payload = {
    ...job,
    job_id: jobId,
    status: job?.status ?? "unknown",
    ...(errorCode
      ? { waiting_interrupted: true, waiting_error: { code: errorCode, message: WAIT_ERRORS[errorCode] } }
      : { waiting_timed_out: true }),
    message: `${errorCode ? WAIT_ERRORS[errorCode] : "The local waiting window ended."} This does not mean the Krea job failed. The job was not resubmitted. Call wait_for_job again with the same jobId to resume.`,
    resume: { tool: "wait_for_job", arguments: { jobId } }
  };
  return {
    ...(errorCode ? { isError: true } : {}),
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload
  };
}

export async function waitForJob(client, args, {
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => performance.now()
} = {}) {
  validateWaitArguments(args);
  const { jobId, timeoutSeconds = 900, pollSeconds = 10 } = args;
  const deadline = now() + timeoutSeconds * 1000;
  let latestJob;
  while (now() < deadline) {
    let result;
    try {
      // Cap each read by both the SDK's usual one-minute limit and the remaining window.
      result = await client.callTool({ name: "get_job", arguments: { jobId } }, undefined, {
        timeout: Math.max(1, Math.min(60_000, Math.ceil(deadline - now())))
      });
    } catch {
      if (now() >= deadline) break;
      return resumableWaitResult(jobId, latestJob, "request_failed");
    }
    // A failed status read is not evidence about the generation's state.
    if (result?.isError) return resumableWaitResult(jobId, latestJob, "upstream_error");
    const job = extractJob(result);
    if (!job) return resumableWaitResult(jobId, latestJob, "invalid_response");
    latestJob = job;
    if (TERMINAL_STATUSES.has(job.status.trim().toLowerCase())) return sanitizeResult(result);
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(pollSeconds * 1000, remaining));
  }
  return resumableWaitResult(jobId, latestJob);
}
