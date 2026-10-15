# Current limitations

Updated October 15, 2026. Actual passed scenarios and evidence are in VERIFICATION.md; the completion checklist tracks remaining work.

## Assessment gaps

- No verified 10 GB+ upload or actual 10-hour processing/startup/late seeking yet.
- Multipart inventory returned [] despite an extant upload with four directly readable parts. Root cause unknown; cancelled/expired storage deletion and orphan discovery need reliable direct evidence.
- Shared client/server metadata/file/part/completion schemas and worker container checks are implemented with boundary tests; live API/browser regression remains pending. Renamed text-as-video rejection passed before this change.
- Required frontend dependencies are integrated in the existing layout; Tailwind adoption is incremental alongside existing CSS. Upload metadata uses react-hook-form and shared zod. Login remains a simple existing controlled form. Broader end-to-end typing and browser regression remain.
- Safari/iPhone/iPad, Samsung Internet and Instagram/Facebook/TikTok webviews untested. Samsung S23 Ultra Chrome and desktop Chrome/Edge/Firefox were reported working; VLC passed.
- Resource guard behavior under load, racing/repeated requests, queued Stop, STOPPED deletion and interrupted deletion need live verification.
- Fresh isolated installation, S3 environment-only portability, docs W1–W7 and final full local checks remain.
- Optional custom-thumbnail upload is not implemented.

## Intentional boundaries

- Queue/history/watch position are browser-profile local; file access requires reselection after tab close. Resume identity is name/size/modification time, not a cryptographic fingerprint.
- Expired browser rows currently say Cancelled. History is capped at 50 and is not true per-user/server-backed history.
- Sequential 64 MiB browser parts and one job per worker; no validated multiworker capacity model.
- Encodes restart from the original after crash/retry. Fixed target heights may upscale small sources; advertised bandwidth/resolution and aspect ratios need review.
- PostgreSQL and Redis reconciliation is recoverable coordination, not an exactly-once transaction.
- CPU/memory limits and application disk monitoring are not hard disk quotas. Original storage and scratch share host capacity.
- Cleanup needs backend/dependencies running. Seven-day idle window updates on signing/listing parts; separate MinIO stale-upload fallback is based on initiation time.
- Missing playback returns HTTP 200 with a NOT_FOUND payload; richer HTTP status semantics remain a possible improvement.
- Current CORS accepts one configured origin. Localhost reviewer defaults and temporary LAN testing are separate configurations. Remote demo needs HTTPS hosting.
- One environment-configured admin, no signup or account-backed credentials. Rate limits, production migrations, private paid CDN media and operational hardening remain production work.
- Legacy migration copies completed objects up to 5 GiB, size-verifies only, and cannot migrate unfinished multipart uploads.
- Tests mostly mock dependencies. Sixty-one preparation tests and a successful host backend check are not a complete live integration suite.

Supplemental TypeScript files have now been received and audited. The diagnostic update adds direct session snapshots and post-deletion verification; it does not resolve the root cause of empty multipart inventory or change production cleanup behavior.

## Step 2 prepared checkpoint

- Step 1 browser title validation and short upload/playback were confirmed by the user;
  LAN HTTP file selection was fixed with a tested upload-key fallback.
- Explicit multi-origin API/MinIO configuration and separate AWS bucket-CORS mode
  are implemented. AWS readback is required; permission errors are not hidden.
- New HLS masters advertise encoded dimensions and measured bandwidth including
  container/audio overhead; existing videos and the fixed three-height ladder remain unchanged.
- Preparation checks: 70 automated tests, all workspace TypeScript checks and Vite
  production build pass. A real local FFmpeg/FFprobe HLS smoke check produced
  854x480 output with measured master metadata. The large bundle warning remains.
- Docker/phone regression and AWS runtime behavior are NOT verified here.
- Multipart listing discrepancy remains open. An unfiltered read-only diagnostic was
  added; direct captured-upload-ID snapshot/verify remains required for cleanup proof.
- Next gate: STEP2-UPDATE.md installation checks, then the remaining smaller tests.

## Multipart inventory diagnosis and cancellation proof — October 15

Session db94fb10-52b0-419b-9f70-f43b8286be3d had two saved multipart parts
(134217728 bytes) before cancellation, verified directly by its captured upload ID.
Prefix-filtered inventory returned no entries while unfiltered inventory returned
that same key/upload ID. This isolates a prefix-listing discrepancy in the running
MinIO setup; the underlying MinIO implementation cause is not established.

After cancellation, captured-ID verification reported database ABSENT, original
absent, generated files zero, multipart ABSENT, saved parts zero, deletionVerified
true. Cancellation storage cleanup is therefore verified, not inferred from listing.
Expiry storage cleanup still needs its own captured-ID before/after test.

The orphan sweeper and default inspector now list without Prefix and filter
originals/ keys locally. Sweeper skips unrelated keys, empty IDs, recent uploads
and tracked resumable uploads; both pagination cursors are retained and nonadvancing
pages fail explicitly. Two regression tests cover scope, pagination and stuck pages.
72 tests and workspace TypeScript checks pass in preparation. Live post-patch
inventory and orphan-expiry behavior remain to be verified.

Step 2 browser regression: user confirmed localhost admin login, Samsung Chrome
public playback, new short upload and quality selection. New session
bd61f9c0-bcbe-4297-bfd9-db28a09694bd master includes measured BANDWIDTH,
AVERAGE-BANDWIDTH and encoded RESOLUTION for all three portrait renditions.
