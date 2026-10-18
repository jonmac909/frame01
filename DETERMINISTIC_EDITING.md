# Deterministic editing contract

New projects require a validated `Edit contract.json` before rendering. The Sienna 15:13.33 cut was owner-approved on 2026-10-18 and remains preserved with its original legacy renderer inputs and pause-trim keep map. Do not migrate or rerender it just to adopt a new contract. Do not set a contract flag off to evade a failed check.

## Normal workflow

1. Download and inspect the whole reference at 4 FPS. Use native-frame inspection for fast transitions. Preserve the close rewrite and the single HeyGen submission. Finish or collect assets before binding their hashes.
2. Save a measured picture plan. `timeline.save` writes `timeline.json` for the standard editor. `plan.save` writes `Full edit plan.json` for section rendering and returns its hash; `plan.read` pages its shots. Both use integer frames at 30 FPS. New section plans use typed general shot kinds and the effect catalog; source-specific hardcoded legacy intros/montages are not exposed as universal templates.
3. Read `effects.catalog`. Select a known effect only where the reference or the owner requires it. Available version-1 primitives: diagonal sweep, dotted connector, measured word reveal, flash, CTA, screenshot camera and presenter inset. Parameters are validated; model-supplied CSS/code is not accepted.
4. Save the edit contract through `contract.save`. It pins the exact source, plan, narration, words, assets and runtime decision. Required source events need a target shot and output timing, or remain explicitly unresolved. An adaptation needs a reason. Source review windows must cover the entire source. These declarations do not prove visual similarity.
5. Run `contract.check`. It rejects stale hashes, unknown word anchors, missing required events, gaps/overlaps, incomplete narration, cuts inside words, audio/video mismatch, repeated demonstration dialogue and unaccounted demonstration audio. `contract.events` pages at most 30 events; do not reread the whole plan for every repair.
6. For the standard timeline, call `render`. For a full section plan, call `render.sections` then `render.assemble`. Each returns a durable job ID. Use `jobs.read` to observe completion; a completed job is technical completion, not owner approval.
7. Review the actual master against source frames at 4 FPS, check rapid transitions at native FPS and listen to phrases/examples at player 1x. Only then bind per-comment evidence through `feedback.verify`. Preserve rejected masters and approved sample snapshots.

## Contract fields

The executable schema is `src/edit-contract.ts`; the director tool exposes it. `tests/production-contract.test.ts` provides a small synthetic example, explicitly not a creative reference.

- `version: 1`, `fps: 30`, total `frames`, project-relative `planFile`, SHA-256 of its exact UTF-8 bytes.
- `runtime`: permitted minimum/maximum output frames and the measured reason. The default source-window policy allows at most ±30 seconds. A documented natural-pace decision can accept a longer runtime. Never force the limit by dropping narration or changing speech speed.
- `source`: exact downloaded source hash, measured frame count, audio declaration, `scanFps: 4`, and contiguous `reviewedWindows`. Source footage is barred from the remake's picture/effect assets.
- `narration`: asset hash, exact script hash, measured native word IDs/start/end frames and output segments `{from,to,trim}`. Native frames must be partitioned exactly once and in order. The word text must match the complete saved script. Estimates must not be represented as independent forced-alignment evidence.
- `assets`: pinned file hashes, measured frame counts and audio-stream declarations. Image assets use a one-frame declaration. Missing/stale assets stop rendering.
- `events`: source ID/category/window/description, required flag, disposition and target. A target references a real shot and either a measured word ID/edge/offset or an explicit frame. Optional effect parameters and sound come from the same anchor.
- `demos`: exact visible asset, source trim, output window, gain and native-audio disposition. Intended silence requires a reason. Dialogue is never looped to fill a hold.

SFX use 48 kHz sample offsets. Their measured `peakSample` lands on the same event frame as the graphic. The audio assembler decodes each distinct asset once, mixes with bounded memory, verifies exact sample counts, and fails on clipping, silence or a short source. It does not silently normalize or truncate. Picture is rendered muted and muxed with the controlled stem. Listen to the final encoded master: mathematical alignment does not establish perceptual quality.

## Cache and recovery

The section cache hashes the effective section plan, relevant media/font bytes, local imported compositor dependencies, package lock/configuration, Chrome executable and render settings. Replacing bytes at the same path invalidates consumers. A local title edit reuses unaffected sections. Shared renderer changes deliberately invalidate all affected sections. Legacy signatures are not silently promoted to the new cache format.

Each reusable section also pins its output hash. A corrupt, incomplete or changed output cannot be reused. Changed sections and masters are archived before replacement. A file without a complete receipt is not finished work. The assembler revalidates all section dependencies and boundaries before joining them.

Editor jobs persist under private `data/jobs/` with existing `running`, `complete` and `failed` states. Receipts retain input identity, process ID, start/heartbeat/end times, duration, result and failure. Reuse a stable `requestKey` on an uncertain transport retry; reusing that key with changed inputs fails. Browser-fill input values are redacted from receipts. Failed/uncertain paid actions are never replayed automatically, and the independent HeyGen allowance guards remain authoritative.

On editor restart, jobs whose owner has exited become visibly failed with an inspection instruction. The system does not infer that a provider submission failed just because the editor stopped. CLI rendering/assembly use exclusive process receipts. Inspect the recorded PID and partial outputs before removing a stale receipt. Do not clear a live receipt.

## Smaller-model operation

Use preflight's failed checks and bounded `reference.read`, `reference.frames`, `contract.events` and `feedback.context` pages. Repair the named event/section with catalog parameters. Avoid asking the model to invent animation code or reread every transcript. Never claim a missing event was implemented by editing its label alone.

Feedback is versioned and private. Verified corrections contribute conditional checks; exact logos/fonts and other project-local choices do not become universal style rules. Unknown notes remain pending. The owner turned off the recurring Chrome collector on 2026-10-18. Imports remain available on an authorized review pass; do not recreate its schedule. This is not an authenticated server inbox or model training. Seven learned check categories are active from the 13 verified corrections. Original verification remains bound to its reviewed master; the final cut's separate owner approval and retained-frame/audio evidence do not relabel those historical reports.

The accepted pause-trim method removes measured quiet and idle example lead-ins with a paired picture/audio keep map, preserving every spoken word and meaningful action at native speed. Its implementation and QA evidence are retained with the approved project. It is currently an agent-assisted finishing step, not a generic automatic director action. Automatic source interpretation, complete forced alignment, owner-private Site publication, and creative audiovisual QA still need the agent and supported platform permissions.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
node scripts/verify-approved-method.mjs
node --import tsx scripts/verify-effects.ts
node --import tsx scripts/verify-production-pipeline.ts
```

The two render checks use synthetic media and an isolated local editor. They do not touch live projects or paid providers. Windows sandbox restrictions may require the supported local-network/path-resolution permission route. The pipeline check covers an actual restart, duplicate-request recovery, two rendered sections, both reused from cache, one local edit with one unchanged section, and exact-duration audio assembly. Evidence is private under `test-results/`.

The approved-method fingerprint test preserves the owner's previous sample artifacts; it does not approve new effects or the complete movie. The synthetic animation check reads actual decoded pixels and asserts initial absence, sweep movement/exit, connector growth, exact title onset, and CTA/title holds. `--inspect-existing` rechecks those pixels only when every fixture dependency and image hash still matches; stale inputs require a fresh render. These assertions test motion behavior, not aesthetic parity. The 3–4 hour target remains an end-to-end benchmark to establish on representative completed videos, including provider waits and repair rounds.
