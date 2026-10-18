# Portable render pilot

Additive CPU-render service for Frame 01. See [measured pilot results](BENCHMARK.md)
before choosing the cloud path. Qwen Image 2.1 and LTX 2.5 remain local;
all A-roll comes from HeyGen. This service cannot generate or purchase media.
It does not change Frontier's installed engine or the approved movie.

## Boundaries

- Private R2 objects, bearer-authenticated Worker, no public media URLs.
- Frozen, checksummed bundle and asset inventory; channel/avatar/voice/style identity.
- Render requests bind the actual runtime code and pinned dependencies. Obsolete code
  cannot satisfy a cached request. Local and cloud results have separate identities.
- At most four CPU workers, 60-second units, 20-minute child deadlines and a
  25-minute coordinator deadline. Failed/uncertain attempts are retained, never
  automatically resubmitted. A durable aggregate reservation stops at $5 compute.
  Storage, Workers/DO charges, and any account subscription are separate.
- Picture-only chunks; final assembly uses one complete validated audio stem.
- Benchmark packages cannot be promoted to production. Full production packaging
  requires Frame 01's complete saved production contract.
- The legacy pause-trimmed Sienna master requires its existing finishing map;
  this pilot deliberately rejects its bakedEdit plan rather than losing that edit.

## Local use

Install this directory's pinned dependencies with `npm ci`. From the application
root, prepare a benchmark with explicit frame ranges (end exclusive):

```powershell
node --import tsx cloud-render/prepare.mjs PROJECT PLAN.json work/package 0:138,900:1050
```

Read `package.proof.json` for the package hash. Obtain the renderer hash with:

```powershell
node --input-type=module -e "import {runtimeHash} from './cloud-render/runtime.mjs'; console.log(await runtimeHash())"
```

Save a job JSON with `version:1`, `packageHash`, `runtimeHash`, `execution:"local"`,
`from`, `to`, `concurrency:2`, `encoder:"software"`. Run:

```powershell
node cloud-render/runner.mjs work/package work/job.json work/units
```

Local NVENC is optional and requires `encoder:"nvenc"`, explicit `videoBitrate`
(such as `12M`), the user's idle-GPU queue, and a quality comparison. CPU execution
is the default. Do not claim hardware encoding has been tested without evidence.

## Cloud use

The GitHub build workflow builds and smoke-tests a code-only Linux image and
returns a short-lived artifact. No Cloudflare credentials or user assets are
uploaded to GitHub. A daemon-free registry client can transfer that image using
short-lived Cloudflare registry credentials. Local Docker is not required.

Create a dedicated private R2 bucket, pin `containers[0].image` to the verified
Cloudflare registry digest, set `RENDER_IMAGE_SHA256` to that digest without its
`sha256:` prefix, and set `RENDER_RUNTIME_SHA256` to the matching code hash.
Set `OWNER_TOKEN` with Wrangler's secret command, then deploy. The checked-in
configuration pins the tested private pilot image. For another account, change
the image reference and bucket binding; never reuse another owner's token.

Save `{ "url": "https://YOUR-WORKER.workers.dev", "token": "PRIVATE-TOKEN" }`
outside version control. Use `execution:"cloudflare"`, software encoding and
at most four tabs per cloud job. Include the exact `imageHash` from authenticated
`/health` in each cloud job:

```powershell
node cloud-render/client.mjs upload work/private-cloud.json work/package
node cloud-render/client.mjs submit work/private-cloud.json work/job-cloud.json
node cloud-render/client.mjs status work/private-cloud.json
node cloud-render/client.mjs download work/private-cloud.json JOB_HASH work/units
```

Submit independent units to run concurrently; the ledger deduplicates identical
requests and rejects excess workers or reservations. Optional `trial:1..10` is
permitted only for benchmark packages. Do not reset the ledger to bypass the cap.

For a complete production package and complete compatible unit receipts:

```powershell
node cloud-render/assemble.mjs work/package work/units work/master.mp4
```

Assembly verifies exact frame coverage, checksums and format. It never overwrites
an existing master. Listening, phrase continuity, 4 FPS comparison and owner review
remain required. A technical receipt is not editorial approval.

## Verification

`npm test` and `npm run check` exercise the portable contracts and worker types.
The [benchmark report](BENCHMARK.md) documents actual deployment, render and
parity checks and their limits. It establishes neither a cloud speed advantage
nor a three-to-four-hour production guarantee. Frontier's 14 style kits must pass
their own sample checks before importing them. Authenticated `GET /workers`
reports platform container state without starting a render.
