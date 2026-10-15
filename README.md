# UGN Video

> **Public viewing:** Open http://localhost:5173/. Uploads and management are at http://localhost:5173/#/admin. See [PUBLIC-PLAYBACK-UPDATE.md](PUBLIC-PLAYBACK-UPDATE.md) for quality selection and verification.

**Upload large videos. Follow processing. Stream your sessions.**

A local video publishing prototype for Underground Nights, built with React, NestJS, PostgreSQL, BullMQ and S3-compatible storage.

> **Project status — in progress**  
> **Batch uploads and processing controls:** See [PROCESSING-CONTROLS.md](PROCESSING-CONTROLS.md) for the current upload queue, Stop/Restart behavior and installation steps.

> **Existing installation?** Follow [RELIABILITY-UPDATE.md](RELIABILITY-UPDATE.md) before starting the updated stack; it includes copying existing LocalStack media into MinIO.

> The core desktop workflow is working. Large-file, long-duration, cross-platform and crash-recovery verification is still pending. See [Verification](#verification) for actual results.

## Start here

| I want to… | Go to |
| --- | --- |
| Start the application | [Quick start](#quick-start-windows--vs-code) |
| Upload, resume or watch a video | [Admin workflow](#admin-workflow) |
| Stop the application safely | [Start, stop and data persistence](#start-stop-and-data-persistence) |
| Change code or run tests | [Development workflow](#development-workflow) |
| Fix an issue | [Troubleshooting](#troubleshooting) |
| Understand the implementation | [How the system works](#how-the-system-works) · [API reference](#api-reference) |
| Check progress toward submission | [Verification](#verification) · [Remaining work](#remaining-assessment-work) |

---

## Prerequisites

- Docker Desktop running **Linux containers**, with Docker Compose available.
- On Windows, Docker Desktop's WSL 2 prerequisites installed and any requested restart completed.
- Git to clone the repository. VS Code is recommended for editing and Source Control.
- Internet access for the first image/dependency download and build.
- Enough free disk space for originals and temporary encoded output. Processing writes a temporary source copy and three output versions; required space exceeds the original file size. Disk preflight and periodic size/free-space guards are implemented; a hard filesystem quota is not.

Node.js is **not required on the host to run the Docker stack**. Host-side development and checks require Node.js; the Docker images currently use Node.js 22.

> **Where to run commands:** the project root, containing `docker-compose.yml` and `package.json`.

## Quick start: Windows + VS Code

### 1. Get the project

In VS Code, open the Command Palette with **Ctrl+Shift+P**, select **Git: Clone**, and enter:

```text
https://github.com/joffreydrummond/ugn-video.git
```

Choose a local folder and open the cloned project. Alternatively, open your existing `ugn-video` folder. Start Docker Desktop, then open **Terminal → New Terminal** in VS Code.

### 2. Create local configuration

For a fresh checkout, run in PowerShell:

```powershell
Copy-Item .env.example .env
```

> **Existing installation?** Skip the copy step and keep your working `.env`.

Open `.env` and set:

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL` | Local admin sign-in email |
| `ADMIN_PASSWORD` | Password you choose for this local installation |
| `JWT_SECRET` | Random signing secret, at least 32 characters; do not use the example placeholder |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Local MinIO credentials; Compose uses these values for storage and application clients |

The template contains examples, not production credentials. `.env` must remain untracked. Never put a real AWS credential in frontend source or commit it to Git.

For Linux/macOS, the equivalent copy command is `cp .env.example .env`.

### 3. Build and start

```powershell
docker compose up --build
```

This builds the applications and starts PostgreSQL, Redis, MinIO, storage initialization, backend, worker and frontend. The first build can take several minutes.

Wait for the backend startup and Vite ready messages. Storage initialization should finish successfully; an exited `storage-init` container with exit code **0** is expected.

Open:

- **Web app:** [http://localhost:5173](http://localhost:5173)
- **Backend:** [http://localhost:3000](http://localhost:3000) — use documented API routes; there is no root landing page required.
- **Local storage endpoint:** [http://localhost:9000](http://localhost:9000) — this is an S3 endpoint, not a storage management dashboard.

Sign in using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your `.env`.

### 4. Confirm the basic flow

1. Choose a short video, preferably a 20–60 second MP4 for the first check.
2. Enter a title and select the file.
3. Click **Start / Resume queue**.
4. Follow upload progress, transfer speed and upload ETA.
5. When upload finishes, its queue row shows that it was received; follow processing in Sessions.
6. Follow the session through queued/processing states to **READY**.
7. Click **Watch session**, check audio and seeking, then click **Close player**.

A short test verifies wiring before a large test; it does not prove large-file or long-duration reliability.

## Admin workflow

### 1. Sign in

The backend issues a JWT in an httpOnly session cookie, with a 12-hour lifetime. On page refresh, the frontend asks `/auth/me` whether that cookie is still valid. A valid session remains signed in; an expired session requires sign-in again. **Sign out** clears the cookie.

There is one configured admin identity and no sign-up flow.

### 2. Upload one or several videos

Choose files using **Add videos**, review each title and optional description, then click **Start / Resume queue**. Titles are limited to 200 characters and descriptions to 5,000. Each file can be up to **20 GiB**; this declared limit does not prove a 10 GB test has passed.

Files upload one at a time using sequential **64 MiB parts** directly to storage. Video bytes never pass through the API server. A completed transfer enters the processing queue while the next selected file uploads. The worker still processes one session at a time.

Per-file progress is capped at 99% until completion is acknowledged. Upload speed/ETA describe transfer only; processing has its own estimate. Completed upload rows link conceptually to Sessions by showing that session's current status. Completed/cancelled rows automatically leave the upload form. The **Upload history** tab retains the latest 50 entries on this browser; clearing that history does not delete sessions.

### 3. Pause or resume the queue

Click **Pause queue**. The current browser PUT is aborted; storage-confirmed parts stay saved. The next start re-lists parts, so a part completed just before the abort is not blindly resent. The unfinished part may need to upload again.

After refresh, the queue restores metadata for each file. Reselect unfinished original files (multiple selection is supported), then click **Start / Resume queue**. Browsers cannot silently reopen local files. Matching uses filename, size and modification time rather than a content hash. Queue metadata is local to this browser/profile; clearing site data or changing devices can remove it.

A failed transfer pauses the queue for attention. Fix the connection and resume. It does not silently skip the failed file. Use one admin tab for queue management; a browser lock prevents simultaneous upload runners where the Web Locks API is available.

### 4. Cancel a queued or unfinished upload

Use **Remove from queue** before transfer starts or **Cancel upload** after it starts. Confirm cancellation. Only that file is cancelled; other queued files remain. An active transfer is aborted and its multipart upload is cleaned. Finalization briefly disables pause/cancel: after completion use the processing controls instead.

Closing a tab is not cancellation. Abandoned uploads expire after seven idle days under the maintenance policy.

### Stop or restart processing

Click **Stop processing** on a queued, processing or retrying session and confirm. STOPPING means the worker must exit and release its lock, then partial output must be cleaned. The original stays saved. Once STOPPED appears, choose **Restart processing** (encoding restarts from the beginning) or **Delete session**.

A worker stopped through Docker may retain its old lock until the 120-second expiry. Keep the backend running and allow roughly 2–3 minutes for stop acknowledgement. The system does not delete outputs under a live worker lock.

### 5. Follow processing

| State | Meaning / action |
| --- | --- |
| `UPLOADING` | Waiting for the browser to finish uploading; resume or cancel as needed |
| `UPLOADED` | Original is stored and processing is queued |
| `PROCESSING` | Worker is preparing, encoding or publishing the video |
| `RETRYING` | A processing attempt failed and another automatic attempt is expected |
| `STOPPING` | Waiting for worker exit and partial-output cleanup |
| `STOPPED` | Original retained; restart from the beginning or delete |
| `READY` | Playback output is published; Watch session is available |
| `FAILED` | Processing failed; inspect the reason, then retry or delete |
| `DELETING` | Storage cleanup is unfinished; use Try delete again |

Retry/Delete and Stop/Restart controls are included. The verification table below records their current test status.

The worker probes the actual media, then encodes 1080p, 720p and 480p versions sequentially using FFmpeg. It generates a poster and uploads the HLS outputs before marking the session READY.

Progress updates are polled about every three seconds. Encoding progress comes from FFmpeg's encoded media time. Time remaining is an estimate derived from measured processing speed, with future passes initially projected using that speed. A provisional publishing allowance is replaced by a measured publishing estimate once output upload begins. The estimate can change as resolution and system load change; it is not a promised deadline.

The stage, estimated completion time and last progress update are stored in PostgreSQL, so they remain available after refresh. The UI says it is calculating when there is insufficient timing data, and flags a stale estimate when it has not received a recent update. Queued sessions do not yet have queue-position or wait-time estimates.

### 6. Watch a session

Ready session cards show a poster, real media duration, upload date and Watch session button. The date is when the upload record was created, not when processing finished. A missing preview does not prevent playback.

The player uses native HLS when the browser advertises support; otherwise it uses hls.js when supported. Playback controls are the browser's native video controls. Watch position is saved per video in browser local storage and restored when appropriate. Closing the player stops playback and releases the media source.

Manual quality selection is still pending. The HLS master currently exposes three variants for automatic selection; cross-platform adaptive-switching behavior needs verification.

### 7. Retry failed processing

Click **Retry processing** on a FAILED session. The backend verifies the original still exists, replaces the exhausted job and queues fresh processing attempts. No new upload is required. An active/queued job cannot be manually retried again.

A manual retry starts encoding from the original; it does not resume a partially encoded rendition. A permanently invalid file will fail again. If the original is missing, upload it again as a new session.

### 8. Delete a session

1. Click **Delete session** on a READY or FAILED session.
2. Read the confirmation. Deletion removes the original, generated playback files, poster and database record.
3. Confirm to continue, or cancel to leave the session unchanged.

The selected player closes if its session is being deleted. Storage objects are removed before the database record. If cleanup fails, the record stays DELETING and **Try delete again** lets an admin finish cleanup.

Queued and processing sessions cannot be deleted through this flow. Locked queue jobs block deletion to avoid deleting files while they are being processed. Use Cancel for unfinished browser uploads.

## How the system works

<details>
<summary><strong>Expand the processing flow, services and storage layout</strong></summary>

1. **Authenticate:** frontend signs in through NestJS; subsequent API requests include the session cookie.
2. **Create upload:** API validates metadata, creates a Video record and initiates a storage multipart upload.
3. **Transfer:** API signs a URL per part; browser PUTs bytes directly to MinIO/S3 and keeps each returned ETag.
4. **Complete:** API completes multipart storage, verifies stored size, updates the record and adds a BullMQ job.
5. **Process:** worker downloads the original into temporary disk, probes it, encodes H.264/AAC HLS variants, and creates a poster.
6. **Publish:** worker streams generated files to storage, publishes the master playlist and marks the session READY.
7. **Play:** browser fetches playback metadata from the API and requests playlists/segments from storage directly.

### Services and responsibilities

| Component | Responsibility |
| --- | --- |
| React/TypeScript/Vite frontend | Admin login, upload, progress, session cards and playback |
| NestJS backend | Cookie auth, upload orchestration, metadata and management endpoints |
| BullMQ worker | ffprobe validation, FFmpeg encoding, poster creation and publishing |
| PostgreSQL 16 / Prisma | Video metadata, lifecycle, progress and ETA |
| Redis 7 / BullMQ | Processing queue, locks and retry scheduling |
| MinIO S3 | Local original files, multipart parts and generated playback files |
| `storage-init` | Creates/configures the local media bucket, CORS and public output-read policy |

The worker runs as a NestJS application context with a managed BullMQ worker and shutdown hook. `packages/contracts` exists, but shared end-to-end DTO/schema use still needs completion.

### Stored media layout

| Storage key | Content |
| --- | --- |
| `originals/<video-id>` | Uploaded source video |
| `videos/<video-id>/master.m3u8` | HLS master playlist |
| `videos/<video-id>/<height>.m3u8` | Rendition playlist |
| `videos/<video-id>/<height>-<number>.ts` | Media segments |
| `videos/<video-id>/poster.jpg` | Generated thumbnail |

The worker uses `/work/ugn-*` directories in a dedicated scratch volume. It removes them after attempts, and sweeps directories belonging to dead attempts at startup and every minute. CPU/memory limits, free-space checks and a two-second scratch-size monitor are configured. This monitor is an application guard, not a hard filesystem quota; reserve adequate host disk for both scratch and stored media. Original uploads are retained for retry until the session is deleted.

</details>

## API reference

<details>
<summary><strong>Expand endpoints, access requirements and playback notes</strong></summary>

Base URL for the local prototype: `http://localhost:3000`.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public | Verify configured admin and set cookie |
| GET | `/auth/me` | Admin | Check session |
| POST | `/auth/logout` | Cookie clearing | Clear session cookie |
| GET | `/admin/videos` | Admin | List sessions and processing details |
| POST | `/uploads` | Admin | Create upload from title, description, filename and size |
| GET | `/uploads/:id/parts` | Admin | List confirmed multipart parts |
| POST | `/uploads/:id/part` | Admin | Sign a part URL; body contains `part` |
| POST | `/uploads/:id/complete` | Admin | Complete upload with ordered part numbers/ETags; queue processing |
| POST | `/uploads/:id/cancel` | Admin | Abort unfinished multipart upload and remove record |
| POST | `/admin/videos/:id/stop` | Admin | Request a processing stop and partial-output cleanup |
| POST | `/admin/videos/:id/retry` | Admin | Restart a failed or stopped video from its original |
| POST | `/admin/videos/:id/delete` | Admin | Delete a ready/failed/stopped session and its media |
| GET | `/videos` | Public | List READY video metadata |
| GET | `/videos/:id/playback` | Public | Return status, manifest URL, poster, duration and renditions |

The public home page lists READY sessions without authentication. Shareable links use #/watch/<id>. The studio at #/admin requires admin sign-in. Retry/Delete/Stop endpoints remain admin-only. Both views use a shared player with native-HLS/hls.js selection, manual quality controls and per-device resume.

Playback metadata can be consumed by native clients, but native playback has not yet been verified. The local manifest URLs use localhost, which points at the requesting device; phone/native testing requires reachable URLs first.

</details>

## Start, stop and data persistence

For detached startup after the initial build:

```powershell
docker compose up -d
```

Check services and follow logs:

```powershell
docker compose ps -a
docker compose logs -f backend worker
```

For foreground startup, Ctrl+C stops the attached stack. To stop containers without removing them:

```powershell
docker compose stop
```

**Persistence is service-specific:**

- PostgreSQL and Redis use named volumes in the current configuration.
- MinIO stores originals, multipart parts and playback media in the `mediadata` volume.
- Worker scratch is stored separately in `workerscratch`; it is not an encoding checkpoint.
- `docker compose stop` stops services. `docker compose down` removes containers but retains named volumes. **`docker compose down -v` deletes database, queue, media and worker-scratch volumes.**
- The old LocalStack service remains under the `legacy` profile for migration only. Do not remove/recreate its container until existing media has been copied and verified.

Persistence is configured; the new MinIO recreation and recovery tests still need local Docker verification. See [RELIABILITY-UPDATE.md](RELIABILITY-UPDATE.md).

## Development workflow

### Save, check, rebuild, verify, commit

1. Edit the appropriate files and **save all** in VS Code: **Ctrl+K**, then **S**.
2. Run the relevant checks below.
3. Rebuild the affected services. A plain restart does not copy changed host files into an image.
4. Refresh the browser and verify the behavior.
5. In VS Code Source Control, review and stage changes, commit with a meaningful message, then Sync Changes.

Frontend-only changes:

```powershell
docker compose up -d --build --no-deps frontend
```

Backend/frontend changes:

```powershell
docker compose up -d --build --no-deps backend frontend
```

Backend/worker/frontend changes:

```powershell
docker compose up -d --build --no-deps backend worker frontend
```

`--no-deps` avoids recreating the existing storage/database services. Use it only when those dependencies are already running. Wait for queued/active processing to finish before replacing the worker unless deliberately testing interruption recovery: an interrupted encode may restart from the beginning.

For Prisma schema changes, build the affected images, apply the schema, then start the new worker/frontend. The current backend startup runs `prisma db push`; do not accept data-loss prompts without reviewing the proposed change. Versioned production migrations remain separate work.

### Local editor dependencies and checks

For TypeScript support in VS Code and host-side checks:

```powershell
npm.cmd ci
npx.cmd prisma generate --schema apps/backend/prisma/schema.prisma
npm.cmd run check --workspaces --if-present
```

On Windows, `.cmd` avoids PowerShell's blocked `npm.ps1`/`npx.ps1` execution-policy issue. On Linux/macOS, use `npm` and `npx` instead.

Run the retry/delete tests after installing the management update:

```powershell
node --import tsx --test apps/backend/tests/video-management.test.ts apps/backend/tests/recovery.test.ts apps/backend/tests/processing-control.test.ts apps/frontend/tests/upload-queue.test.ts apps/worker/tests/process.test.ts
```

These are dependency-mocked tests, not live storage/Redis integration tests. The management/recovery/control/queue tests cover upload-completion reconciliation, queue outages, exhausted stalled jobs, orphan-upload cleanup, and retry eligibility, original existence, duplicate prevention, enqueue failure, locked-job protection, multi-page object deletion and retryable partial cleanup.

If host Node is unavailable, the running backend container includes the workspace dependencies:

```powershell
docker compose exec backend npm run check --workspaces --if-present
docker compose exec backend node --import tsx --test apps/backend/tests/video-management.test.ts apps/backend/tests/recovery.test.ts apps/backend/tests/processing-control.test.ts apps/frontend/tests/upload-queue.test.ts apps/worker/tests/process.test.ts
```

### File map

<details>
<summary><strong>Find the file to change</strong></summary>

| Path | Change here for |
| --- | --- |
| `apps/backend/src/main.ts` | Auth, API routes and upload orchestration |
| `apps/backend/src/video-management.ts` | Retry/delete coordination and media removal |
| `apps/backend/tests/video-management.test.ts` | Management unit tests |
| `apps/backend/prisma/schema.prisma` | Video model and processing fields |
| `apps/worker/src/main.ts` | Probing, encoding, progress, ETA and output publishing |
| `apps/frontend/src/main.tsx` | Upload flow, session UI and player |
| `apps/frontend/src/style.css` | Current styling and responsive layout |
| `packages/contracts/src/index.ts` | Shared contracts; wider adoption pending |
| `docker-compose.yml` | Services, endpoints, ports and resource limits |
| `infra/Dockerfile` | Runtime image, system tools and dependency installation |
| `.env.example` | Tracked configuration template |
| `.gitignore` | Files excluded from Git |
| `.dockerignore` | Files excluded from Docker build context |

</details>

## Verification

Keep implementation, automated checks and real-device observations separate. Update this table with exact versions, dates and results as tests are performed.

| Check | Current evidence |
| --- | --- |
| Prisma generation / TypeScript | Passed in preparation environment; rerun after changes |
| Docker startup | Working on Joffrey's Windows Docker Desktop setup |
| Desktop sign-in, refresh/session retention, sign-out | Reported working during development |
| Upload → processing → READY → playback | Reported working on short clips and an approximately 940 MB / 19m54s video |
| Pause → refresh → reselect same file → resume | Reported working; completed parts retained |
| Processing stage, percentage, ETA | Reported working |
| Upload form reset / Close player | Reported working |
| Session posters, duration and dates | Reported working |
| Automated management and recovery tests | Fifty tests (mostly dependency-mocked, plus a real child-process abort test) passed in preparation environment; original eight also passed on Joffrey's machine |
| Retry/delete live Docker/storage behavior | Joffrey verified deletion and manual retry scheduling with an invalid file on the earlier LocalStack stack; successful transient-failure recovery still pending |
| 10 GB+ upload and resume | Pending |
| 10-hour video processing, startup and seeking | Pending |
| Worker crash/restart and enqueue-crash recovery | Pending |
| Storage container recreation persistence | MinIO volume configured; live recreation test pending |
| Chrome / Edge / Firefox / Safari individually | Formal versioned matrix pending; no claim of all-browser verification |
| iOS/iPadOS, Android, in-app browsers | Pending |
| VLC / AVPlayer / ExoPlayer | Pending |

### Suggested manual checks

1. Sign in, refresh, sign out and sign back in.
2. Upload a short valid video; confirm the reset form and automatic state changes.
3. Close/reopen the player; check sound, seeking and watch-position restoration.
4. Upload a larger video, pause at a completed part, refresh, reselect and resume. Confirm it does not restart from zero.
5. Confirm a second video queues behind an active job.
6. Delete a disposable READY session; cancel confirmation first, then confirm and refresh. Verify other sessions still play.
7. For a controlled invalid-media test, create a text file outside the repository:

   ```powershell
   Set-Content -Path "$env:TEMP\ugn-invalid.mp4" -Value 'This is a test, not a video.'
   ```

   Upload it and wait for automatic attempts to reach FAILED. Retry should requeue without a new upload, then fail again because the source remains invalid. Delete it afterward. This proves scheduling/rejection, not successful recovery from a transient failure.
8. Test a valid video recovering after a temporary failure, then complete the large-file, interruption and device checks.

Do not commit generated test videos, recordings or the confidential assessment PDF.

## Troubleshooting

<details>
<summary>UI change does not appear</summary>

Save the correct project file, rebuild frontend, refresh with Ctrl+Shift+R

</details>

<details>
<summary>VS Code reports missing NestJS/Prisma modules</summary>

Run local dependency install and Prisma generation above

</details>

<details>
<summary>PowerShell blocks npm/npx scripts</summary>

Use `npm.cmd` / `npx.cmd`; no execution-policy change is needed

</details>

<details>
<summary>Sign-in returns Unauthorized</summary>

Match the local `.env` values; recreate backend after environment changes

</details>

<details>
<summary>JWT secret startup error</summary>

Configure a random secret of at least 32 characters, then recreate backend

</details>

<details>
<summary>Storage PUT returns HTTP 400</summary>

Inspect the failed request's response and MinIO logs. Backend S3 clients must keep `requestChecksumCalculation: 'WHEN_REQUIRED'` for the current presigned-part flow; changing browser URLs after signing can also invalidate requests

</details>

<details>
<summary>Upload succeeds but ETag is unreadable</summary>

Check bucket CORS exposes `ETag` and allows the frontend origin

</details>

<details>
<summary>Processing appears slow</summary>

Check actual duration/resolution, queue state and worker CPU. File size alone is not processing duration

</details>

<details>
<summary>Processing has no recent update</summary>

Read worker logs and check processes; an estimate is not evidence the worker is alive

</details>

<details>
<summary>READY session fails after storage recreation</summary>

Check MinIO health and the mediadata volume; DB metadata alone cannot restore deleted video bytes

</details>

<details>
<summary>Delete is unavailable</summary>

Only READY/FAILED/DELETING sessions support deletion; unfinished uploads use Cancel

</details>

<details>
<summary>Delete refuses an active job</summary>

Wait for its queue lock/processing to finish and retry; do not manually delete storage underneath it

</details>

<details>
<summary>Public page is missing</summary>

The public API exists; a public viewer UI is still pending

</details>

<details>
<summary>Phone cannot load or play localhost URLs</summary>

Localhost refers to the phone itself. Reachable API/storage URLs, CORS and access configuration must be added first

</details>


Useful diagnostics:

```powershell
docker compose ps -a
docker compose logs --tail=100 backend worker minio
docker compose top worker
```

When requesting help, provide the failing action, service logs and browser Network response/error. Do not share `.env`, session cookies, tokens or signed upload URLs containing credentials/signatures.

## Current scope

Implemented: cookie authentication, direct multipart transfer, resume using storage-confirmed parts, part-boundary pause/cancel, asynchronous three-rendition HLS processing, actual-media probing, poster/duration, lifecycle polling, measured encoding progress/ETA, admin session cards, playback/watch-position persistence, upload reset and player close. Retry, stored-media deletion and readable failure messages were verified locally on the earlier stack. This update adds persistent MinIO configuration, idle-upload cleanup, periodic reconciliation, NestJS worker lifecycle and disk/ownership guards; the updated stack still needs live verification.

Important limits:

- The UI persists metadata for multiple uploads, one active transfer at a time; original files must be reselected after refresh.
- Actual-media probing rejects files with no video stream, but container allowlists and fuller client/server validation remain incomplete.
- Per-file description entry is implemented. Custom-thumbnail input is not implemented.
- Encoding uses fixed heights; no-upscaling/aspect-ratio handling, accurate advertised bandwidth/resolution and adaptive-switch validation need review.
- CPU/memory limits and periodic disk guards are implemented. Hard disk quotas and long-video behavior remain unverified.
- Retry and crash recovery restart processing from the original, with no encoding checkpoints. A periodic reconciler repairs PostgreSQL/Redis gaps; there is no distributed transaction or exactly-once guarantee.
- Media persistence and automatic abandoned-upload cleanup are implemented but still need live Docker verification. Uploads expire after seven days without signing/listing activity; that activity refreshes the idle window.
- Localhost origins/endpoints and HTTP development cookies are for local use, not a production deployment configuration.

See `LIMITATIONS.md` and `VERIFICATION.md` for remaining requirements and evidence. Update test results after running the new stack.

## Remaining assessment work

Prioritize required behavior over additional visual polish:

- [x] Verify retry/delete scheduling and deletion against the earlier local stack.
- [ ] Repeat core checks after the MinIO transition; prove successful recovery of a valid video.
- [x] Implement automatic abandoned-upload cleanup and durable storage configuration.
- [ ] Verify expiration cleanup, storage recreation and worker crash recovery on the updated stack.
- [x] Add the public READY-video viewer and manual quality selection.
- [ ] Verify quality switching, public viewing and native/mobile playback on actual devices.
- [x] Implement upload/queue reconciliation and worker disk/ownership guards.
- [ ] Finish media validation and validate resource guards under load.
- [ ] Complete required stack conventions: Tailwind/theme/fonts, form validation libraries, notifications/icons/motion and shared contracts.
- [ ] Verify 10 GB+ uploads, long-video processing/seek/startup, interruption recovery, and major desktop/mobile/in-app/native playback paths.
- [ ] Add live integration tests and playback API tests; dependency-mocked reconciliation and management tests are included.
- [ ] Complete `ARCHITECTURE.md`, `ANSWERS.md` (W1–W7), the actual browser/device matrix and final limitation notes. Record a demo if time allows.
- [ ] Verify a fresh checkout starts using the documented instructions and contains no secrets or media, then submit the repository link.

No claim of a completed assessment should be made until required behavior and deliverables have been checked, or remaining omissions have been explicitly disclosed.

## Documentation maintenance

For each feature commit:

- Update the relevant user workflow, API/file-map entries and known limits.
- Add the actual test result, environment and date; never turn a planned test into a passed result.
- Reconcile `LIMITATIONS.md` and `VERIFICATION.md` with the new behavior.
- Keep operational instructions here; avoid appending temporary patch-install notes to the README.
- Keep design reasoning in `ARCHITECTURE.md` and written assessment answers in `ANSWERS.md` once added.

## AI assistance disclosure

Joffrey Drummond directed requirements and tested the application locally. ChatGPT assisted with the initial scaffold, implementation changes, troubleshooting, automated tests and documentation. Preparation-environment checks and Joffrey's runtime observations are identified separately above. AI-generated code must be reviewed, understood and independently verified; the candidate must be able to explain and modify the implementation during review.

### Public playback checkpoint

Public catalog and the shared quality-selecting player are implemented; live browser/device verification is pending. The API now includes explicit rendition URLs via sources while preserving the numeric renditions list. Run all tests with `npm.cmd test` on Windows or `npm test` elsewhere. Public routes do not check admin authentication; upload/history controls stay at #/admin.
