# Sienna finishing source archive

This directory preserves the exact nine Python sources used for final Sienna finishing, including the CPU speech-check dependency. The approved output is SHA256 `fc9b67193689329fc6aff65eb5d70d91feb27455e49ea520c0e03054d87d8c8e`, 27,400 frames / 15:13.33 at 30fps. Its input revision was `709274b77302ffcdddd3619e49079a841fbd37c28e3f52a255f81ea69750dabb`, 29,323 frames / 16:17.43.

Files retain their original bytes as **`.py.txt` source records**, with hashes and original filenames in `manifest.json`. They are not imported, executed or advertised as generic app commands. This preserves the actual implementation without making case-specific overwrite paths or historical inspection declarations into production tools.

| Original source | Purpose and boundary |
| --- | --- |
| `measure-revision-pauses.py` | Measures native audio quiet at several thresholds; quiet is only a cut candidate. |
| `analyze-pause-trim.py` | Proposes quiet cuts with speech-edge margins and protected graphic/CTA/SFX windows; extracts example-start inspection sheets. |
| `build-pause-trim.py` | Builds a keep map, retimes metadata and makes paired frame/48kHz-sample edits. Five example lead-in cuts and an inspection statement are specific to Sienna. |
| `verify-pause-trim.py` | Compares every retained output frame and audio segment against the keep map, checks seams and emits join sheets. |
| `verify-complete-speech.py` | Runs the existing offline CPU ASR against actual media; retains raw differences and overlapping-chunk behavior for assessment. |
| `run-pause-trim-qa.py` | Sequences paired verification and speech checking in the original runtimes. |
| `prepare-pause-trim-preview.py` | Prepares an isolated private review package and checks chapters; does not publish the Site. |
| `record-pause-trim-inspection.py` | Historical writer of completed visual inspection statements. Running it is not inspection and must never certify another cut. |
| `finish-pause-trim-delivery.py` | Historical evidence/handoff writer with exact Sienna token expectations and then-pending publication status. That status was later resolved; it is not current release truth. |

## Reuse boundaries

Use the measurement, keep-map and paired-edit algorithms as references when adapting another finishing pass. Preserve breaths, meaningful silent action, every word and native speed. New decisions require that video's measured audio, example inspection and fresh artifact-bound QA. A baked post-trim plan describes retained output; rendering it again as an unbaked composition changes animation timing.

These files expect the original private plans, assets, subtitles, model installation, workspace layout and FFmpeg paths. Some commands overwrite named outputs. Do not rename/run them against approved artifacts or reuse their fixed counts, hashes, paths or inspection declarations as another video's evidence. A future portable implementation should accept explicit inputs, protect existing outputs and generate fresh evidence; historical attestation writers must not become automatic pass/fail gates.

The original environment used Python, NumPy, OpenCV and Pillow. CPU ASR additionally used PyTorch, SoundFile, Transformers and the local Qwen model. Model weights, environments, plans, media, private feedback and QA receipts are excluded. The active reusable pipeline remains under `src/`, `scripts/` and `video/`; see [the deterministic contract](../../DETERMINISTIC_EDITING.md) and [release validation](../../RELEASE_VALIDATION.md).

Check archive integrity without executing historical scripts:

```powershell
python examples/sienna-finishing/verify_archive.py
```
