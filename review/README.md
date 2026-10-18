# Frame 01 source comparison

Static source for the existing owner-private side-by-side review. The current approved remake is **15:13.33**, SHA256 `fc9b67193689329fc6aff65eb5d70d91feb27455e49ea520c0e03054d87d8c8e`; the source is **12:31**. Earlier samples remain historical references with their original media and timing.

- The full comparison plays nine chapter pairs continuously. Each player has independent play/pause, full-film seeking, sound, fullscreen and actual elapsed/total runtime. Chapter duration must not be presented as full-film duration.
- Shared controls include 1x/2x playback and source/ours/off sound. Both players use the selected rate; sync maps seeks and chapter positions without slowing source speech to stretch it over the remake. Chapter readiness handling prevents playback from running into missing media.
- Private-host H.264/AAC chapters load as blobs for reliable seeking. The manifest binds previews to the exact master and separate source/remake timings. Preserve the existing private audience when deploying.
- Approved opening and camera sample views remain available. Their earlier A-roll speed and creative decisions are historical; the full approved film uses native 1x speech and includes the requested CTA corrections.
- The comment box captures current time when focused. Notes retain stable IDs, their own reviewed-master version, timestamp, optional source timestamp and original text. Old notes keep their original version when a new cut is displayed.
- Comments remain in the owner's browser and can be exported. The version-aware collector imports the rendered note list during authorized work. The recurring 30-minute collector is paused; this is not a server-backed inbox. See [feedback learning](../FEEDBACK_LEARNING.md).

This directory contains reusable UI source. Private `media/`, `full-manifest.json`, hosting configuration and credentials are excluded. On the original machine the Site's deployable tree is `dist/`; copying this public directory alone does not recreate its private media or publish a functioning review. Prepare chapter media and the manifest from the actual exported artifact, use the supported existing Site workflow, and verify hosted playback and access.

Page labels are not authoritative owner-approval records. See [APPROVED_EDITING_METHOD.md](../APPROVED_EDITING_METHOD.md) and [RELEASE_VALIDATION.md](../RELEASE_VALIDATION.md).
