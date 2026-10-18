# Frame 01 — local video editing agent, v1

Run **Start Video Editor.ps1** and open **http://127.0.0.1:4317**. This is a separate local app; it does not change AutoAiGen or its GPU services.

This repository contains the Windows local editor, Eve director, existing-Chrome bridge, automatic window recorder, Remotion compositions, source-analysis scripts and artifact checks. Reference analysis samples the complete video at **4 fps**, without a frame cap, and saves timestamped frames, candidate changes, and contact sheets. Extraction alone does not establish semantic visual review.

New projects use the [deterministic editing contract](DETERMINISTIC_EDITING.md): required source-event coverage, word-anchored effects/SFX, complete narration and paired demo audio, reusable typed effects, content-aware section caching and persistent jobs. Feedback checks are described in [FEEDBACK_LEARNING.md](FEEDBACK_LEARNING.md). These mechanisms make failures visible and edits repeatable; they do not guarantee arbitrary creative quality or a three-hour turnaround.

Private project data, recordings, generated/reference media, course materials, local models, portable runtimes and credentials are excluded. The example production scripts target the original local project and require those private inputs; cloning this repository does not recreate its paid media or reset its durable generation allowance. The replacement path requires separately recorded, explicit authorization and preserves the prior attempt ledger.

The exact final pause-trimming and verification helpers are preserved as an inspectable [Sienna finishing source archive](examples/sienna-finishing/README.md), including the CPU speech-check dependency. They are project-specific historical source, not additional director actions. Current release evidence is summarized in [RELEASE_VALIDATION.md](RELEASE_VALIDATION.md).

Prerequisites: Node.js 24, installed Chrome, FFmpeg/ffprobe and yt-dlp. Set the documented path environment variables for another machine. Install JavaScript dependencies with `npm ci`, then run `npm run editor` and `npm run director` in separate terminals, or use the Windows launchers. Connect Eve using **Connect Director.ps1**. The optional analysis scripts additionally use Python with NumPy, SciPy, Pillow and OpenCV; CPU ASR requires the separately installed model and its Python runtime. Local generation expects the existing queue services configured in `src/local-generation.ts`; it does not install or start them.

## Use your existing Chrome

**Walkthrough recording is unattended.** Frame 01 uses a private portable OBS runtime with Windows Graphics Capture, saving 1080p30 MP4 and 4fps review sheets directly into the project. The agent calls `record.prepare` with the observed software URL, selects that window, reads the live browser viewport, starts recording, performs the real UI steps and stops/imports the clip. No Frame 01 extension attachment is needed for recordings. Your existing Chrome profile stays signed in; a dedicated walkthrough window isolates the capture. Keep that window unminimized during recording. Microphone/system audio and OBS's remote-control server are disabled; CPU encoding leaves GPU1's model queue alone. Install/recover the official checksum-verified portable runtime with `node scripts/install-recorder.mjs`.

The extension instructions below are the optional legacy bridge for guarded HeyGen interactions, rather than the screen-recording workflow.

The app does not restart Chrome, open a separate production profile, or copy cookies. Its local extension connects only tabs you explicitly attach.

1. In Chrome, open `chrome://extensions` and enable Developer mode.
2. Click **Load unpacked** and select this app's `chrome-extension` folder.
3. On your existing signed-in HeyGen tab, click **Frame 01 — Existing Chrome Bridge**, select the Nano Banana project and **HeyGen A-roll**, then **Attach this tab**.
4. Software walkthroughs use the automatic recorder described above.
5. Return to the editor. **Open HeyGen** now inspects the attached existing tab; it does not create another browser.

Extension access: `activeTab` and `scripting` for the selected tab; `tabCapture` and an offscreen recorder for its video; local storage for the loopback connection; alarms for reconnecting. Its only permanent host permission is `http://127.0.0.1:4317/*`. It has no cookie, password, browsing-history, or all-websites permission. Moving to another origin requires reattaching. Closing Chrome ends tab access. **Disconnect this tab** stops accepting new commands for that attachment. Finish an active recording before disconnecting.

## One HeyGen draft and one video

The project ledger is written to disk before either browser click. Simultaneous retries, failures, restarts, and ambiguous outcomes do not reset it. Link/reconcile the existing draft/video URL to continue. There is no automatic reset or replacement action. All A-roll must be generated as one complete video, then cut locally. The agent must verify the exact avatar, voice, motion model, tone, and full final script before submission. Reference-backed remakes also require an unchanged narration/reference fingerprint, complete timing coverage, section word budgets within 6%, and total words within 2%. These checks do not replace measured voice alignment. Never use one paid job per scene or a paid test generation.

HeyGen UI interactions use fresh observed elements. If a UI change or confirmation dialog blocks continuation, stop and inspect the same draft. Do not create another. V1's automatic draft verification expects one continuous script visible in the editor; complex multi-scene drafts may require manual completion in that same draft. Existing Chrome downloads remain in your normal Downloads folder; import the completed MP4 into the project.

## What v1 can do

The exact `Bonus Resources/ULTIMATE FILMMAKING PACK 1` folder is indexed as the preferred editing asset library. **Filmmaking pack** in the app searches/imports sound FX, fonts, transitions, motion backgrounds, and LUTs. SFX can be auditioned after import. The timeline supports timed audio layers with independent volume/fades, transition overlays, an imported font, and nondestructive LUT processing to a new clip. The director is instructed to prefer the pack, especially mouse clicks and whooshes, and keep sound FX beneath narration.

- Search course transcripts and extracted prompt documents, with source and approximate timestamp/character location.
- Fetch YouTube metadata, captions and downloadable 1080p reference video using yt-dlp with its supported Node runtime; analyze the complete local file at 4 fps. `reference.frames` pages the samples and returns contact-sheet paths for `media.inspect`.
- Generate local Qwen Image 2.1 illustrations and LTX 2.5 video through GPU1's existing queue, with idle checks and durable per-asset request receipts. Collect existing jobs instead of resubmitting after a timeout. Completed outputs from both models were inspected in the source-length remake, including fourteen silent 9.96-second LTX examples.
- Use the connected Eve director to write and save original narration and production notes.
- Inspect and operate Chrome through the existing browser tools. Automatically record a dedicated real walkthrough window and import its 1080p MP4.
- Import A-roll, B-roll, narration, screen captures and timed SRT/VTT captions.
- Validate and render sequential timelines with continuous narration, captions, animated title cards, step cards and lower thirds.
- Export H.264 MP4 and a proof JSON containing duration, dimensions, audio presence and the timeline.

## Current limits

The owner approved the full 15:13.33 pause-trimmed Sienna cut on 2026-10-18, SHA256 `fc9b67193689329fc6aff65eb5d70d91feb27455e49ea520c0e03054d87d8c8e`. It retains all 177 narration cues at native 1x; 64.1 seconds of measured quiet and idle example lead-ins were removed with paired picture/audio edits. All 13 original corrections have artifact-bound verification and contribute seven conditional quality-check categories. The earlier samples, masters and evidence remain preserved. Run `node scripts/verify-approved-method.mjs` to verify private approved artifacts on the original machine. See [APPROVED_EDITING_METHOD.md](APPROVED_EDITING_METHOD.md) for the locked v1 procedure.

This is an approved agent-assisted v1, not yet a guaranteed unattended URL-to-video service. Source interpretation, measured pause trimming, creative audiovisual review and private Site publication still require the agent and supported platform permissions. The three-to-four-hour target needs another end-to-end production benchmark. Recurring review checks are off at the owner's request; saved feedback remains available and new comments can be imported during an authorized editing pass.

The optional legacy HeyGen bridge still requires its chosen tab attached. Walkthrough recording uses the automatic native window recorder and existing Codex browser controls; it does not capture microphone or tab audio. Native desktop apps are not driven by v1; their recordings can be imported. Automatic Qwen ASR/forced alignment and arbitrary motion-graphic code generation are not integrated. `aroll.align` validates complete exported subtitle text and exact section-start cue boundaries without estimating cuts or changing speed. A script is a preparation artifact until product claims and demonstrations are verified. No HeyGen generation is considered verified until its completed media is downloaded and checked.

## Files and recovery

Projects, HeyGen allowance ledgers, imported media and exports live under `data/projects/<id>`. Keep `data/` private; it contains local session identifiers and the bridge token. Project events and media survive restart. Native recordings preserve raw MKV under `recordings/raw/`; `record.status` identifies interrupted captures and `record.stop` can normalize them once the prior owned recorder has exited. Never imply a capture passed until its MP4 and proof exist. Do not delete a project to get another HeyGen allowance for the same remake.

The director uses Eve's supported local ChatGPT connection. If it reports missing credentials, close the background director and run **Connect Director.ps1**, then `/login`. Keys are managed by Eve; do not paste them into this app's source files. The app binds to loopback only.

Developer checks: `npm run typecheck`, `npm test`, `npm run build`. Rendering uses Remotion and installed Chrome; FFmpeg/ffprobe are configured in `src/core.ts`. Runtime paths can be overridden with `FFMPEG_PATH`, `FFPROBE_PATH`, `YTDLP_PATH`, `CHROME_PATH`, `COURSE_DIR` and `EDITOR_DATA_DIR`. `EDITOR_TEST_BROWSER=1` permits an isolated test browser for recording tests only; production recording uses the selected window in existing Chrome.
