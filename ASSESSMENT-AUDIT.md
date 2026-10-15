# Assessment source audit — October 15, 2026

Baseline: user checkpoint 8787fce plus uploader and keyboard fixes. Complete supplemental .ts archive received. Existing behavior should be preserved as requirements are added.

## Source-confirmed next work

1. Cleanup diagnostics: direct ListParts worked while bucket inventory did not. New snapshot/verify tool captures the upload ID before database removal, verifies the same ID afterward, counts originals/generated objects, and rejects storage/configuration errors. It does not claim to fix inventory discovery. Live cancelled/expired tests still required; orphan sweep depends on inventory and needs separate diagnosis.
2. Shared validation: backend title schema permits whitespace-only values; filename has no supported-container extension validation. Completion/part zod parse failures are not converted consistently into HTTP 400. Frontend uses imperative checks rather than the required shared zod/react-hook-form validation. Worker verifies a video stream/duration, not a container allowlist. Add focused boundary tests and keep actual-media checks in the worker.
3. Frontend conventions: package lacks Tailwind, required fonts, react-hook-form + zod, Framer Motion, lucide-react, react-hot-toast. Add real uses in existing forms/status/navigation, not unused dependencies or a UI rewrite. Dependency/lockfile changes must accompany implementation.
4. Media output: fixed-height encoding can upscale sources. Master advertises fixed bandwidth and lacks RESOLUTION/CODECS. Preserve legacy playback while improving truthful metadata and measuring output. No claim of measured ABR bitrates yet.
5. Portability: backend supports one origin; MinIO global CORS enables current local browser tests, but init-storage does not configure bucket CORS for real AWS. AWS region-specific bucket creation and endpoint/path-style configuration need review for the environment-only requirement.
6. Operational proof: remaining live idempotency/races, validation/security routes, batch scenarios, queued Stop, STOPPED/interrupted deletion, clean install, resource guards and large media. Existing mocked coverage is useful, not live proof.
7. Deliverables: keep results current; prepare ARCHITECTURE and W1–W7. Pricing assumptions need sourced current research when W3 is written. Final local checks/build, reviewed commit/push and demo come before submission.

## This package changes

- Read-only infra/inspect-storage.ts and new infra/storage-inspection.ts.
- Five regression tests in apps/backend/tests/storage-inspection.test.ts.
- Updated README, verification, limitations and completion checklist.
- A repeatable Windows storage-verification procedure.

No runtime upload, encoding, queue, auth, UI, schema or dependency changes. No Docker stack validation performed here. The diagnostic script is run explicitly by an operator and never imported into application startup.

## Working order

Install diagnostic package → complete cleanup evidence → shared validation/forms and required frontend conventions → run remaining small checks → isolated startup/doc completion → commit a verified checkpoint → disk preflight and >=10 GB upload → actual 10-hour evidence or honest limitations → final submission.

Do not run a long upload until capacity is checked. A 10 GB file is not necessarily a 10-hour video. Keep S23 Ultra Chrome passed and unavailable Safari/webviews explicitly Not tested.

## Step 1 addressed in prepared source

Shared validation and worker actual-container allowlist implemented. HTTP 400 handling now covers malformed signing/completion payloads. Required frontend libraries have real uses: upload form state/errors, theme utilities/local fonts, action icons, completion/cancellation notifications and reduced-motion-aware page transition. Existing layout CSS is retained. Six validation tests added (61 total). Browser/API regression pending. The other findings above remain open; inventory diagnosis, AWS CORS and rendition metadata are not fixed by this update.

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
