---
name: krea-workflows
description: Use Krea's authenticated MCP tools for image or video generation, live model discovery, enhancement, upscaling, asset workflows, and visual verification. Use when a user asks Codex to create, compare, enhance, upscale, organize, or show work with Krea.
---

# Krea Workflows

Use the authenticated Krea MCP connection to carry visual tasks through to a real, inspectable result.

## Operating rules

1. Prefer Krea MCP tools for model discovery, generation, video, enhancement, upscaling, and asset operations. Do not use Chrome when the MCP exposes the required operation.
2. Query Krea's live model catalog and model schema before relying on model names, parameters, costs, or limits.
3. Submit generation, video, and enhancement jobs asynchronously. Capture the job ID before doing anything else; never use a long synchronous request as a dependency between workflow stages.
4. Poll the captured job until Krea reports a terminal status. `processing`, `queued`, or a client polling deadline is not a failure. Resume with `get_job` instead of submitting a duplicate.
5. Never resubmit after an ambiguous transport timeout unless Krea has confirmed that no job was created. This avoids duplicate generations and charges.
6. Keep one controlled variable when comparing settings. Reuse the same prompt, model, LoRA, aspect ratio, and style reference unless the user requests a broader exploration.
7. Preserve originality. Treat styles and LoRAs as visual ingredients; vary camera, silhouettes, layout, lighting, and focal hierarchy unless copying is explicitly requested.
8. Verify completion from the MCP job's terminal status and returned original asset URL, then inspect the saved output when visual quality matters.
9. Save important source and final assets to the active project when possible. Record the prompt, model, slider values, LoRA/style ID, final dimensions, job ID, and Krea session URL.
10. Use the `Nicholas (krea)` Chrome profile only as a fallback for Krea features the MCP does not expose, or when the user explicitly requests the website.

## Long-running jobs and widget fallback

- Poll after approximately 10, 20, and 30 seconds, then at 60-second intervals. Do not flood Krea or narrate every poll.
- Treat only Krea's documented completed, failed, or cancelled states as terminal. If a host widget stops polling or says to check later, continue from the saved job ID with `get_job`.
- If a job exceeds the model/provider's documented service window without a terminal state, report it as potentially stalled with its age and job ID. Stop noisy polling, preserve the job for later recovery, and do not resubmit automatically.
- If the MCP App widget fails to load, continue through the tool result and job API. The widget is presentation, not the source of truth.
- If the task spans turns, preserve the job ID, requested settings, and destination path so work can resume without a new submission.

## Route the task

- For generation, comparisons, or enhancement, read [references/workflows.md](references/workflows.md) and follow only the relevant section.
- For a multi-setting comparison, define the profiles before generating and label each output by its exact values.
- For enhancement, choose the requested resolution explicitly. Interpret “maximum” as the largest supported output dimensions while preserving aspect ratio—not maximum values for every creative-strength control.

## Deliver proof

Return concise proof: MCP tool, job ID, terminal status, model ID, settings, output dimensions, returned original URL, and files saved. Show final visuals when the user asks to see them.
