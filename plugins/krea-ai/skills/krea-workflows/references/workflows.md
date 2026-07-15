# Krea workflow reference

## Generation and controlled comparisons

1. Call Krea's model-listing tool and select the exact model ID.
2. Call the model-schema tool before constructing inputs. Use only parameters supported by the returned live schema.
3. Submit generation asynchronously and immediately record its job ID.
4. Poll `get_job` with bounded backoff until Krea reports a terminal status. A host widget polling deadline is non-terminal; resume from the same job ID.
5. For comparisons, keep the model, prompt, aspect ratio, references, and all non-tested parameters identical.
6. Save every returned original asset URL locally before judging the outputs.
7. Compare composition, anatomy, legibility, style fidelity, and artifacts before choosing winners.

## Maximum-resolution enhancement

1. List enhancement models and inspect the selected model's live schema.
2. Upload or provide the source asset using the MCP-supported input form.
3. Choose the requested scale or target dimensions explicitly. For “maximum,” use the largest schema-supported output that preserves aspect ratio; leave creative-strength controls at neutral or task-appropriate values unless the user asks otherwise.
4. Keep enhancement settings identical across a comparison unless the experiment is specifically about enhancer settings.
5. Submit the enhancement asynchronously and record the enhancement job ID.
6. Poll that exact job. Long processing is expected at very large resolutions and must not be converted into a failure or a duplicate submission.
7. Save the returned original-resolution asset locally and verify its dimensions.

## Chained workflows

For generation followed by enhancement, editing, or video:

1. Submit stage one asynchronously and save its job ID.
2. Poll stage one to completion.
3. Pass the returned original asset URL—not a preview proxy—to stage two.
4. Submit stage two asynchronously, save its separate job ID, and poll it independently.
5. If a transport call times out after submission, query the saved job rather than repeating the submission.

## Failure semantics

- `queued` and `processing` are healthy non-terminal states.
- A widget render error does not imply the Krea job failed.
- A client-side polling limit means “resume later,” not “failed.”
- A job that exceeds its provider service window should be identified as potentially stalled; preserve its ID and avoid automatic resubmission or indefinite minute-by-minute narration.
- Report the exact server error for a true failed or cancelled job and preserve completed upstream assets.

## Asset handling

- Prefer the original asset URL returned by the Krea MCP over resized preview proxies.
- Keep originals and enhanced versions in separate folders.
- Use clear names such as `restrained.png`, `balanced.png`, `expressive.png`, and `*-max.png`.
- Build a contact sheet or emit the individual images when the user asks to see results.
