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
