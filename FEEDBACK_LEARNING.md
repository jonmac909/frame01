# Feedback learning

Owner request, 2026-10-17: every review round must improve later edits. The registry is private runtime data at `data/feedback/reviews.json`; it must not be included in a source release.

## Implemented loop

1. Import owner-authored review comments with the project, exact reviewed version, timestamp and original text. Reimporting the same batch is idempotent. Unknown comments remain visible and pending; keyword categorization is only routing, never an instruction to apply an automatic fix.
2. `preflight.check` includes pending feedback counts and applicable learned checks. Read `feedback.context` before planning and before repairing a cut. Existing provider limits and user instructions take precedence.
3. Repair the project. Keep one-shot details local to the reviewed project/version. For example, requesting Google's logo on one banana does not put Google's logo into every future video.
4. Verify each correction against an actual exported artifact. Write a project-relative JSON evidence report with its SHA-256, method, and a separate passing entry for each comment. `feedback.verify` checks that artifact hash, existing evidence, comment ownership and all passing entries before recording verification. The evidence is a recorded agent/test attestation; the store does not itself perform audiovisual inspection or grant owner approval.
5. A verified correction automatically contributes its conditional quality checks to future projects. The check says to inspect the current source's graphics, transitions, speech pace or audio; it does not impose a prior video's exact creative choice. Supported categories are in `src/feedback.ts`. For unknown categories, the original request remains project-scoped; extend the check catalog deliberately with a regression test if a genuinely new general mechanism is needed.
6. If the owner rejects a correction, `feedback.reopen` preserves the previous verification in history and retracts that observation from learning. Another independently verified example can still support the same check.

## CLI and director

`node --import tsx scripts/feedback.ts import PROJECT BATCH.json`

Batch: `{ "reviewUrl": "https://...", "version": "exact-master-sha-or-sample-version", "comments": [{ "at": 12.08, "text": "...", "externalId": "optional-stable-comment-id" }] }`.

`node --import tsx scripts/feedback.ts context PROJECT`

Browser collector: `node --import tsx scripts/feedback.ts collect PROJECT SNAPSHOT.json`. Snapshot shape is `{ "reviewUrl": "https://...", "comments": [{ "id": "stable-comment-id", "version": "64-character-master-sha256", "at": 12.08, "sourceAt": 11.5, "text": "..." }] }`. Read these values from the rendered review-note DOM data attributes, not hidden browser state. Mixed versions are imported separately. Legacy notes keep their original master and the centisecond timestamp used by the earlier Markdown export, so collection does not duplicate those 13 records.

Director actions: `feedback.import`, `feedback.context`, `feedback.classify`, `feedback.verify`, `feedback.reopen`.

Verification request: `{ "commentIds": ["..."], "artifact": "exports/final.mp4", "evidence": "qa/comment-repairs.json" }`.

Evidence: `{ "artifactSha256": "...", "method": "audiovisual-review", "comments": [{ "id": "...", "passed": true, "summary": "What was corrected and actually inspected", "checks": [{ "name": "4 FPS comparison", "passed": true, "detail": "The relevant source/output windows and observed result" }] }] }`.

Use `automated-check` only for tests that actually ran. Missing or clipped speech, bad acting, misleading software demos and aesthetic matching can require listening/visual review. A checksum proves evidence identity, not judgment quality. Verification is for the named artifact only; reverify affected comments after a further edit. Never relabel an old proof as a new master's QA.

## Collection boundary

The hosted reviewer currently retains comments in the owner's Chrome local storage. A Codex feedback monitor reads the registered review pages through supported browser controls and imports new notes; it needs Codex running and the signed-in Chrome profile available. It must not claim background server synchronization. Persisted comments and learned checks remain available after browser or agent restarts. Future review deployments must retain a stable project mapping and exact version identity. A proper authenticated server-backed review inbox is the durable next replacement for browser collection.

No automatic model-weight training, provider settings changes, paid retries, arbitrary code execution from comments, or global transplantation of another project's style occurs.
