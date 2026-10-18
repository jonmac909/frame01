# CPU render pilot: October 18, 2026

**Decision: keep local rendering as the default.** The optional private Cloudflare
service works, but this first measured workload did not establish a speed advantage.
Do not automatically migrate full episodes or promise a three-to-four-hour turnaround.

## Measured workload

Four existing 1080p/30 FPS samples: logo cards (4.6 seconds), presenter (5 seconds),
animated example carousel (5 seconds), and logo/CTA/software transition (5 seconds).
All use the same frozen Remotion bundle and assets. The 66-file input package is
679,487,818 bytes. No footage, speech or avatar was regenerated.

The Windows machine has an Intel Core Ultra 9 285K and approximately 64 GB RAM.
Frontier was active during these measurements, so they are shared-host observations,
not a controlled hardware benchmark. Cloud workers report AMD EPYC, four logical
CPUs and approximately 12 GiB RAM. Both paths use software H.264 CRF 19 and swangle.

| Sample | Local render, 2 tabs | Cloud render, first trial | Cloud render, 4-worker batch |
|---|---:|---:|---:|
| Logo cards | 11.71 s | 30.03 s | 39.29 s |
| Presenter | 21.72 s | 40.48 s | 42.64 s |
| Example carousel | 32.65 s | 142.56 s | 146.10 s |
| Logo/CTA/software transition | 19.54 s | — | 42.06 s |

Local sequential totals including each unit's verification and startup:
**92.17 s at 2 tabs, 99.29 s at 4 tabs, 100.70 s at 6 tabs**. Six tabs is the
existing legacy full-remake setting. Two was best in this small loaded-host sweep;
the existing production settings were not changed on the strength of one sweep.

Cloud observed completion, including startup, asset retrieval and status polling,
was **91.97 s for one sample**, **191.86 s for presenter + carousel in parallel**,
and **191.70 s for all four in parallel**. Downloading all four results brought the
last figure to 192.45 s. These exclude the initial PC-to-R2 upload. The slow carousel
dominated both parallel batches. These timings must not be linearly extrapolated
to an entire episode with a different mix of scenes.

An actual repeated local render returned the cached unit in **1.07 s**, versus
13.99 s for the fresh opening unit in that test. A repeated completed cloud request
returned the existing result without creating a job or increasing its reservation.
Repeating a cloud sample here started a new container; it is not a measured warm
container benchmark. Containers stop immediately after their result is durable.

## Output and operating checks

- All seven cloud jobs completed with exact expected frame counts, 1080p and 30 FPS.
- All four unique cloud samples were inspected at 4 FPS against the local render.
  SSIM at those samples was 0.992780–0.999492. No missing media or changed layouts
  were observed. This is render parity evidence, not a new source-style approval.
- The three repeated cloud samples produced identical output hashes across trials.
  Local 2-tab and 6-tab outputs matched for all four samples. One 4-tab output
  differed slightly (4 FPS SSIM 0.999088), so rerendering is not claimed bit-identical
  across all concurrency settings or operating systems.
- A synthetic two-chunk assembly produced 60 exact frames with a single continuous
  audio stem; silence detection found no >=20 ms silence below -50 dB at the join.
  This does not certify a whole episode's narration or example audio.
- Four-worker enforcement was tested live: a fifth request was rejected without
  adding a job or reservation. All seven container states were then read as stopped.
- Anonymous Worker requests return 401. The R2 public development URL is disabled.
- Fourteen contract/scheduler/file tests and TypeScript checking passed. CI also
  builds the Linux image and opens Chromium through the actual Remotion renderer.

The retained ledger has **$1.1697 in conservative compute reservations** for seven
25-minute maximum slots, within its $5 cap. This is **not the actual bill**. Do not
reset the ledger to recover budget. Storage, Workers/DO and account subscription
charges are separate. No Runpod or generation purchase was made by this pilot.

## Remaining gates

This is an opt-in CLI/backend pilot, not a completed Frontier integration. Frontier's
installed engine, fourteen active style jobs, production app and approved master
were not modified. Its Python/FFmpeg farm has not been replaced with Remotion.

Before production cloud routing: integrate Frontier's saved ready-media plan and
identity bindings; preserve the accepted finishing map; fetch only each unit's
needed assets; measure longer balanced units; verify a complete episode and all
audio/joins; then test two independent complete episodes. Only promote channel
styles after their existing sample quality gates pass. Full-length cloud replay,
warm-container timing, actual billing reconciliation and NVENC quality/performance
are unverified. The GPU idle/no-preemption rules were preserved.

Private raw evidence is retained in the local app's `work/cloud-render-pilot/`:
local and cloud benchmark JSON, unit receipts, 4 FPS sheets, parity measurements,
cache/deduplication/cap proofs, assembly fixture and stopped-worker snapshot.
Those media, credentials and private evidence are intentionally absent from Git.
