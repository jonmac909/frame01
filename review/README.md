# Private comparison player

This folder contains the static comparison-player code. Media, hosting credentials and site access configuration are intentionally excluded. Serve the folder over HTTP after supplying your own authorized assets and `full-manifest.json`.

`review-loader.js` selects the full edit or the preserved opening/camera views. The full manifest has `fps`, `frames`, `duration`, `previewResolution`, `masterResolution` and a `sections` array. Each section contains `name`, `index`, `from`, `to` (output frame bounds), `sourceFrom`, `sourceTo` (source seconds), `source` and `ours` (media URLs).

The player fetches each section as a Blob because private hosting byte-range seeking was unreliable. It supports chapter jumps, a global timeline, frame stepping, one audible video at a time and browser-local notes. Source and remake durations within a chapter can differ; this is an editorial comparison, not proof of exact cut or lip-sync matching. Deployment must preserve the intended private audience.
