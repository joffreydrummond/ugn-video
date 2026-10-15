# UGN assessment and portfolio completion checklist

Updated: October 15, 2026. Source: supplied UGN assessment, sections 02–09.

## Current checkpoint — October 15, 2026

Latest confirmed commit: 8787fce (public browsing/adaptive playback). Review ZIP reports modified BatchUploader.tsx and Player.tsx plus untracked checklist; latest fixes still need a commit. Push status remains unconfirmed.

| Checkpoint | Result |
| --- | --- |
| R1 | PASS: MinIO recreation retained playback |
| R2 | Automatic same-job recovery to READY observed; final crash-test playback not explicitly recorded before later deletion |
| R3 | Pause at 67%, subsequent upload success; exact resumed percentage not captured |
| R4 | Closed-tab original reselection/resume confirmed; wrong-file rejection not yet tested live |
| R5 | PASS: actual Offline interruption, reconnect/resume completed |
| R6 | PARTIAL: expired DB row absent and browser history reconciled; storage baseline/listing unreliable |
| R7 | PARTIAL: 4 parts / 256 MiB directly observed before cancel; DB removed and fresh editable upload passed; multipart removal not directly established |
| R8 | Active Stop/Restart passed; READY later observed by API; queued stop pending |
| R9 | Invalid renamed text failed, manual retry failed usefully, public exclusion passed; recoverable manual-retry scenario pending |
| R10 | READY/FAILED storage and DB removal passed (83 generated objects removed for READY); STOPPED/interrupted deletion pending |
| R11 | Live repeated/racing checks pending |
| B1 | Auto changed resolutions under Fast/Slow 4G; manual qualities passed |
| B5 | Keyboard (Space fixed/retested), Tab, paused quality change and metadata reported working; screen reader pending |
| B6 | Resume at 45 seconds passed; near-end/storage-denied subcases pending |
| B7 | Playlist/segment/poster MIME/cache/CORS HEAD checks passed; full upload/preflight and LAN header audit pending |
| B8 | READY and NOT_FOUND API payloads verified; VLC playback/seek passed; native app integration docs pending |
| B9 | Deleted-link message and network Try again recovery passed; remaining status/unsupported-engine cases pending |
| Access | GET admin/videos and POST uploads unauthenticated 401; public catalog 200; remaining protected actions/logout checks pending |
| Devices | Desktop Chrome/Edge/Firefox and Samsung S23 Ultra Chrome passed reported playback checks; VLC passed. Versions pending; Safari and webviews not tested |
| Automated | Latest prior prepared source: 50 tests and TS checks passed. Windows backend Prisma/TS passed; complete Windows suite/build unconfirmed |
| Main remaining test | Real >=10 GB upload and actual 10-hour processing/startup/late seeking; resource/disk evidence |
| Stack | Required frontend libraries/forms/theme still missing; source audit pending omitted .ts files |

Supplemental .ts archive received. Complete-source review and preparation checks passed (55 tests). Snapshot/verify diagnostics added; live cleanup evidence still pending. Do not repeat the prior archive command with a blanket .ts exclusion.

Next sequence: install/verify direct cleanup diagnostics → validation/security/batch/repeated-action checks → required-stack gaps → isolated setup and final checks → docs checkpoint commit → large-media test. See VERIFICATION.md for precise observed evidence.

## How to use this checklist

Check a box only after observing the expected result. Unchecked means unverified or unfinished, not necessarily broken. Record failures and fix/retest before marking passed. Keep actual browser/device names, media size/duration, dates, and relevant logs. Never publish confidential assessment text, credentials, or video files.

## Confirmed checkpoint

- [x] User confirmed public viewing in Incognito without signing in.
- [x] User confirmed playback with every offered manual quality selection in Incognito.
- [x] Public and admin routes open as intended, per user report.
- [x] Latest prepared update passed 50 automated tests and workspace TypeScript checks in assistant environment. This is not live Docker integration evidence.
- [ ] Run those automated checks on the installed Windows checkout; record actual count and result.

Previously reported working: normal uploads, processing, batch/history UI, retry/delete, and stop controls. Verify the precise failure scenarios below; these reports do not establish every edge case.

## Gate 0 — preserve the working version

- [ ] Review `git status --short`, `git diff --stat`, and `git diff`.
- [ ] Ensure .env, node_modules, video files, archives, and storage/scratch data are not staged or tracked. Keep .env.example with placeholders.
- [ ] Run `npm.cmd run check --workspaces --if-present` and `npm.cmd test`.
- [ ] Stage only reviewed source/docs files; inspect `git diff --cached --stat` and `git diff --cached`.
- [ ] Commit the current working public-player/upload version. Suggested message: `feat: add public playback and improve upload management`.
- [ ] Push checkpoint to the intended repository/branch. Record commit SHA.

Do not rewrite existing meaningful history. Do not push more commits after the submission email; make subsequent portfolio improvements in a separate branch/repository until review is complete.

## Gate 1 — reliability, one scenario at a time

Use disposable media for destructive tests. Recreate storage only while uploads/processing are idle. Never use `docker compose down -v` against your working data.

- [x] R1 Storage persistence: record a READY session; recreate MinIO without deleting its named volume; wait healthy; same poster, manifest, segments and playback still work.
- [ ] R2 Worker crash: kill worker during encoding, start it, allow lock/stalled recovery; job reaches READY or a useful bounded failure, never remains a zombie PROCESSING. Capture logs and resulting state. (A9)
- [ ] R3 Upload pause/resume: pause after confirmed parts; resume; confirmed parts reused, correct progress and playable output. (A3–A4)
- [ ] R4 Refresh/closed tab: close during upload, reopen/reselect matching original; resume server-confirmed parts rather than restart. Reject mismatched reselected file. (A3)
- [ ] R5 Network interruption: browser network drops during part transfer; recover/resume without duplicated session or corrupted final media. (A3)
- [ ] R6 Abandoned cleanup: shorten idle timeout for a disposable unfinished upload; leave idle past expiry; record and multipart data removed. Restore normal timeout immediately afterward. (A5)
- [ ] R7 Cancel upload: cancel mid-part; session and multipart removed; selecting same file starts a fresh editable title/description. (A4–A5)
- [ ] R8 Stop processing: stop queued and actively encoding sessions; encoding actually terminates; original preserved; restart completes. Extra feature.
- [ ] R9 Retry: invalid media fails with useful reason; retry is bounded and never READY. Retry a recoverable failure and reach READY. (A9–A10)
- [ ] R10 Delete: READY, FAILED, STOPPED sessions delete originals and all generated objects; interrupted deletion can finish safely on retry. (A10)
- [ ] R11 Concurrency/idempotency: repeated complete/retry/stop/delete requests do not create competing jobs, inconsistent states or media deletion during active encoding. (A9–A10)

## Gate 2 — upload requirements

- [ ] A1 Upload real valid media at least 10 GB; record exact byte size, duration and result. Do not substitute a small-file test for this evidence.
- [ ] A2 Inspect Network: part PUTs go directly to storage; API carries orchestration JSON only. Verify long-term storage credentials are absent from frontend assets/responses.
- [ ] A3 Complete R3–R5; document filename/size/last-modified matching and server ListParts reconciliation.
- [ ] A4 Verify progress, speed/ETA, pause/resume/cancel under interruption; distinguish upload from processing progress.
- [ ] A5 Complete R6–R7 and inspect actual storage, not only disappearing UI rows.
- [ ] A6 Validate client AND server with zod: blank/too-long title, description limit, zero-byte, max-size boundary and supported containers. Renamed non-video fails actual probing; never becomes public.
- [ ] A7 Async BullMQ job produces three playable renditions, poster, accurate duration, H.264/AAC output (including silent-video handling).
- [ ] A8 Lifecycle/progress changes appear without page reload, including RETRYING, FAILED and extra stop states.
- [ ] A9 Complete crash/idempotency tests; inspect configured retry/backoff/lock settings and resource bounds.
- [ ] A10 Complete retry/delete tests; useful errors do not expose secrets/internal diagnostics publicly.
- [ ] Batch regression: several files, per-file metadata, pause queue, cancel one, one invalid item, refresh/reselect remaining; correct metadata/history, no duplicates.
- [ ] Resource evidence: observe CPU/memory/scratch during representative work; inspect low-disk handling and scratch cleanup. Record limits and re-encoding-from-start tradeoff.
- [ ] S3 environment-only portability: review endpoints/region/path-style/credentials/public URL settings and provider-specific operations; document anything not tested against real AWS.

## Gate 3 — playback requirements

- [ ] B1 Auto mode: throttle network during sufficiently long playback; observe actual rendition changes in requests/player events. Manual selection alone does not prove ABR.
- [ ] B2 Measure first-frame time on a 10-hour stream; record browser/network/startup time.
- [ ] B3 Seek late in a 10-hour stream (example 07:42:10); measure delay and verify only relevant HLS segments load.
- [ ] B4 Exercise native HLS on Safari and hls.js fallback on a supported desktop browser; document detection.
- [ ] B5 Check poster/title/duration, manual switching while playing AND paused, preserved position/audio sync, keyboard navigation and screen-reader labels.
- [ ] B6 Watch partway, refresh/return and resume; near-end reopen behavior is sensible; storage unavailable does not crash player.
- [ ] B7 Inspect actual responses: playlist/segment/poster MIME types, public GET/HEAD CORS and upload PUT/ETag CORS, playlist versus segment cache headers.
- [ ] B8 Call public playback API unauthenticated; manifest/poster/duration/renditions/status available; open manifest in VLC or stock native player. Document native integration.
- [ ] B9 Direct links show meaningful loading, processing, failed, missing, unsupported-engine and network-error states; retry recovers where possible.
- [ ] Public list exposes READY sessions only; unauthenticated mutation/admin requests fail; login/logout work.

## Gate 4 — platform matrix

Record actual device, OS/browser version, play/audio/seek/quality/resume, inline behavior, rotate/lock and result. Mark unavailable platforms NOT TESTED; do not infer support.

| Platform | Actual verification | Result |
| --- | --- | --- |
| Desktop Chrome Incognito | User reports public playback and all manual quality options; version not recorded | Partial pass |
| Desktop Edge | Pending | Not tested |
| Desktop Firefox | Pending | Not tested |
| macOS Safari | Pending | Not tested |
| iPhone/iPad Safari | Pending, include inline/rotate/lock | Not tested |
| Android Chrome | Pending, include inline/rotate/lock | Not tested |
| Samsung Internet | Pending | Not tested |
| Instagram webview | Open reachable link inside actual app | Not tested |
| Facebook webview | Open reachable link inside actual app | Not tested |
| TikTok webview | Open reachable link inside actual app | Not tested |
| Native-compatible player | Open same HLS manifest in VLC/stock player | Not tested |

localhost on a phone refers to the phone. Establish reachable frontend/API/storage URLs and CORS before device testing; do not count a connection-setup failure as a codec failure.

## Gate 5 — stack, usability and clean install

- [ ] Audit required npm workspace stack: NestJS backend AND worker, Prisma/Postgres16, BullMQ/Redis7/ioredis, React19/TypeScript/Vite, shared contracts, Compose, FFmpeg/ffprobe.
- [ ] Audit frontend requirements: Tailwind theme (#DC2626/dark), Bebas Neue/Montserrat, Framer Motion, lucide-react, react-hot-toast, react-hook-form + zod, hls.js. Missing required libraries/conventions need implementation or explicit disclosure.
- [ ] Audit jose JWT httpOnly cookie auth and safe environment configuration; no signup required.
- [ ] Responsive layout, visible keyboard focus, reduced-motion behavior, labels and helpful errors.
- [ ] Fresh isolated checkout/project with separate disposable volumes starts via documented single Compose command, including MinIO source build and storage initialization. Existing working volumes must remain untouched.
- [ ] Restart entire stack; data remains and pending work recovers.
- [ ] Automated suite covers orchestration/state transitions/playback API with meaningful assertions; distinguish mocked unit tests from integration tests.

## Gate 6 — submission deliverables

- [ ] README: prerequisites, one-command startup, example config, local admin setup, public/admin URLs, commands for checks/tests, troubleshooting and AI-use disclosure.
- [ ] ARCHITECTURE: upload/process/playback diagram, data model, chunk size/concurrency justification, security, queue/crash/retry/resource tradeoffs, native playback and alternatives.
- [ ] ANSWERS W1: 63% Wi-Fi drop, 20-minute return and overnight resume.
- [ ] ANSWERS W2: crash nine hours in, lost work, production improvement.
- [ ] ANSWERS W3: AWS storage/compute/CDN estimate for specified workload; explicit assumptions, current pricing sources, self-hosted versus MediaConvert.
- [ ] ANSWERS W4: iPhone/webview failure causes and mitigations.
- [ ] ANSWERS W5: private/paid playback with caching and native clients.
- [ ] ANSWERS W6: Next14/React18/Prisma/MySQL/S3/CloudFront port.
- [ ] ANSWERS W7: deliberate simplifications and next week priorities.
- [ ] TEST-MATRIX: actual outcomes, precise media sizes/durations/devices, evidence, limitations and untested items. Remove stale counts or claims.
- [ ] Review public repo for secrets, generated media, confidential assessment PDF and accidental archives; .env.example supplied.
- [ ] Final checks/tests/build pass on final revision. Commit meaningful milestones and push before emailing.
- [ ] Recommended 5–10 minute demo: large upload, interruption/resume, mobile playback and recovery explanation.
- [ ] Submit by Oct 15 EOD with repository URL, optional demo, approximate hours and limitations. No further pushes after submission email.

## Portfolio improvements — only after core evidence and submission

- [ ] Add CI for checks/tests/build and a small integration smoke test.
- [ ] Add structured logs, queue/processing metrics and operational documentation.
- [ ] Improve encoding based on source dimensions and accurate rendition metadata/bitrates.
- [ ] Add captions/chapters or thumbnail scrubbing; choose one useful feature rather than all stretches.
- [ ] Investigate checkpointed/parallel transcoding, private CDN playback and true per-user history as separate designs.
- [ ] Add a public-safe case study with architecture, measured results and honest tradeoffs; use permitted sample media.

## Evidence log — copy one row per scenario

| ID | Date / commit | Environment / media | Steps and expected result | Actual result / evidence | Pass / Fail / Not tested |
| --- | --- | --- | --- | --- | --- |
| R1 | | | Recreate MinIO retaining volume; old video plays | | Not tested |

Next action: follow the current checkpoint sequence above. Original detailed boxes stay unchecked where any listed subcase remains unverified.

## Latest audit

See ASSESSMENT-AUDIT.md for source-confirmed gaps and the order of work. New read-only cleanup diagnostics have 5 automated tests, bringing the suite to 55; live verification remains pending.
