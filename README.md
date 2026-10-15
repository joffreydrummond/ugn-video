# UGN Video

A video publishing prototype with resumable direct-to-storage uploads, background FFmpeg processing and public adaptive HLS playback.

**Verified baseline:** a 12.08 GB camera recording uploaded, resumed after tab closure, processed into three HLS qualities and played on desktop and Samsung Chrome. Storage byte size matched exactly. Recovery, cleanup, batch controls, auth and a fresh-checkout short-video flow were also exercised. **Ten-hour media, Apple/webview platforms and AWS runtime remain unverified.** Standard and Smooth presets were verified against encoded output, catalog controls passed browser checks, and Windows Narrator announced the tested session metadata and controls. The final local checks passed, including 80 automated tests. See [VERIFICATION.md](VERIFICATION.md) and [LIMITATIONS.md](LIMITATIONS.md).

Design: [ARCHITECTURE.md](ARCHITECTURE.md) · Written responses: [ANSWERS.md](ANSWERS.md) · [Cost assumptions](COST-ESTIMATE.md) · [Completion checklist](UGN-COMPLETION-CHECKLIST.md) · [Large-media procedure](docs/LARGE-MEDIA-TEST.md).

## Run locally

Prerequisites: Git, Docker Desktop using Linux containers, Docker Compose, network access for first build, and enough disk space for originals plus worker copies and three renditions. Host Node.js 22 is needed only for local development/checks.

1. Clone the repository and open its root:
   ```powershell
   git clone https://github.com/joffreydrummond/ugn-video.git
   Set-Location ugn-video
   ```
2. Create configuration (PowerShell):
   ```powershell
   Copy-Item .env.example .env
   ```
3. Set your local ADMIN_PASSWORD and a random JWT_SECRET of at least 32 characters. The configured single admin is ADMIN_EMAIL (default example admin@ugn.local); there is no signup or database-seeded account. MinIO credentials must match the app clients.
4. Start:
   ```powershell
   docker compose up --build
   ```

MinIO builds from pinned source using infra/Minio.Dockerfile because registry pulls failed in the development environment. The first build can take time. Storage initialization must exit 0; backend health gates worker startup. Clean-checkout startup and short upload/playback passed with a separate Compose project and fresh volumes; cached build layers were not cleared.

- Public viewer: http://localhost:5173/#/watch
- Admin studio: http://localhost:5173/#/admin
- API health: http://localhost:3000/health
- S3 endpoint: http://localhost:9000 (not a management dashboard)

**A fresh installation starts with an empty library.** My test videos and Docker volumes are not included in Git. Upload a short video from Admin studio to exercise your own instance.

Keep .env untracked. .env.example contains development placeholders only. Never commit media or confidential assessment material.

## Upload and manage sessions

Open admin, sign in, choose one or multiple supported files, edit each title/optional description, then click **Start / Resume queue**. Titles allow 1–200 characters, descriptions up to 5,000. Declared file ceiling is 20 GiB; the tested input was 12,083,152,331 bytes.

Files transfer sequentially using 64 MiB multipart parts directly to S3-compatible storage. The API signs/orchestrates requests; it does not proxy video bytes. Each completed file enters BullMQ processing while the next browser file can upload.

- **Pause queue** aborts the current PUT and preserves confirmed parts. Resume reconciles storage; an incomplete part may be resent.
- Closing/refreshing stops browser transfer. Metadata persists in this browser profile, but local file access does not. Use the single **Choose Files** picker to reselect original files, then explicitly click Start / Resume. Matching uses name, size and modification time, not a content hash.
- A network error pauses the queue for attention. Reconnect, then resume. Manage queue editing in one tab; Web Locks prevent concurrent runners where available.
- **Cancel upload** removes the unfinished session through server cleanup. Cancelled/completed rows move to browser-local history (latest 50); history is not per-account or cross-device.
- **Stop processing** preserves the original and waits for worker exit/lock release and partial-output cleanup before STOPPED. Restart re-encodes from the beginning.
- **Retry processing** requeues a FAILED session using its stored original. Invalid media will fail again.
- **Delete session** removes original, generated objects and DB record for READY/FAILED/STOPPED; interrupted cleanup remains DELETING for retry. Do not delete storage manually beneath an active encoder.
- Abandoned uploads expire after seven idle days by default. Signing/listing parts refreshes activity. A running backend performs maintenance; dependency outages delay it.

Expired uploads currently appear as Cancelled in browser history; distinguishing Expired is an open UX improvement.

## Processing and playback

Lifecycle: UPLOADING → UPLOADED → PROCESSING → READY / RETRYING / FAILED, with STOPPING / STOPPED and DELETING management states. UI polling shows stage/progress without manual refresh.

FFprobe verifies actual media; FFmpeg sequentially creates fixed 1080p, 720p and 480p H.264/AAC HLS, poster and duration. New uploads offer Standard (up to 30 fps), Smooth motion (up to 60 fps, default) and Original frame rate. Lower-frame-rate inputs are preserved; common NTSC rates retain their 29.97/59.94 relationships. This is server-side processing after upload, not pre-upload compression. The selection is fixed once the upload session is created and is reused on retries; existing database rows retain Original behavior. Estimated completion changes with measured speed; it is not a deadline. Worker concurrency is one, with Compose CPU/memory limits and application scratch/free-space guards (not hard disk quotas).

A killed worker's lock expires before stalled-job recovery. The tested job automatically restarted and reached READY. The current 120-second lock can mean roughly 2–3 minutes before recovery. Crash/retry restarts encoding from the original; no encoding checkpoints.

Public pages list READY sessions only and never require admin login. The catalog supports title/description search, newest/oldest/title sorting, library counts and clear no-match feedback. Admin cards show the saved processing preset. Native HLS is preferred when advertised, otherwise hls.js is used. Auto/manual quality, shareable links, useful unavailable/network states, and per-browser watch resume are implemented. Space is handled by native controls; K toggles playback, arrows seek and M mutes. Tab reaches controls.

### Public API

- GET /videos: public READY catalog.
- GET /videos/:id/playback: status, title, description, duration, poster, master manifest, rendition heights and explicit sources.
- Missing IDs currently return HTTP 200 with status NOT_FOUND, null media URLs and empty rendition/source arrays.
- Admin listing, upload orchestration and management require the jose JWT httpOnly cookie.
- Native clients can pass manifestUrl to an HLS player. VLC consumption has passed; AVPlayer/ExoPlayer and Safari device testing are not directly verified.

## Phone testing on the same network

Defaults remain localhost so reviewers can run this project on their own machines. For a phone, use the computer's actual Wi-Fi/Ethernet IPv4 (not WSL/Docker adapter). In your uncommitted .env:

```dotenv
FRONTEND_ORIGIN=http://YOUR_LAN_IP:5173
FRONTEND_ORIGINS=http://localhost:5173,http://YOUR_LAN_IP:5173
S3_CORS_MODE=minio
S3_BROWSER_ENDPOINT=http://YOUR_LAN_IP:9000
S3_PUBLIC_URL=http://YOUR_LAN_IP:9000/media
```

Keep S3_ENDPOINT=http://minio:9000 for container traffic. Wait for uploads/processing to become idle, then recreate minio/backend/frontend with `docker compose up -d --no-deps minio backend frontend`. Use http://YOUR_LAN_IP:5173/#/watch on desktop and phone; the explicit FRONTEND_ORIGINS list allows localhost and LAN browsers together. Do not put spaces around the commas (MinIO consumes the list directly). Check private-network firewall access to 5173/3000/9000 if unreachable. No router port-forwarding is needed.

To return to localhost, set FRONTEND_ORIGIN=http://localhost:5173, remove the optional FRONTEND_ORIGINS override, set S3_BROWSER_ENDPOINT=http://localhost:9000 and S3_PUBLIC_URL=http://localhost:9000/media, then recreate those services. LAN HTTP testing is not an internet deployment; a remote live demo needs separately configured HTTPS hosting. GitHub hosts the source, not this Docker runtime.

## Development and checks

On Windows:
```powershell
npm.cmd ci --ignore-scripts
npx.cmd prisma generate --schema apps/backend/prisma/schema.prisma
npm.cmd run check --workspaces --if-present
npm.cmd test
npm.cmd exec -w @ugn/frontend -- vite build
```

Prisma generation on the host supplies editor types; Docker generation does not update host node_modules. Restart VS Code's TypeScript server if needed. Elsewhere use npm/npx without .cmd.

The tests include queue transfer/reconciliation, management/recovery/processing controls, public serialization, playback helpers and subprocess abort behavior. 80 tests passed in the source workspace and Joffrey confirmed the final Windows checks and production build passed. See the verification record for automated versus runtime evidence.

After source changes rebuild affected services. Save a reviewed Git checkpoint before destructive tests. Avoid staging .env, media, node_modules, archives, volumes and generated output.

## Persistence and troubleshooting

`docker compose stop` stops services; `docker compose up -d` starts them. Named volumes retain Postgres, Redis, media and worker scratch. **Do not run down -v against data you want to keep.**

Useful commands:
```powershell
docker compose ps -a
docker compose logs --tail=100 backend worker minio
docker compose top worker
```

For stale UI rebuild frontend and refresh. A restored upload needs original-file reselection. For phone failures check reachable frontend/API/storage and matching CORS. For presigned PUT failures inspect response and retain requestChecksumCalculation WHEN_REQUIRED; do not rewrite signed URLs.

**Multipart inventory:** the live MinIO instance omitted uploads when a Prefix filter was supplied. The inspector and orphan sweeper now list without Prefix and locally filter originals/ keys; post-fix live listing passed. Captured-ID cancellation and tracked-expiry checks passed at the evidence level recorded in VERIFICATION.md. Inventory alone is not proof of removal. See [STORAGE-VERIFICATION.md](docs/STORAGE-VERIFICATION.md).

## Verification boundaries

The large-file end-to-end test passed; actual ten-hour duration/startup/late-seek evidence remains unverified. The written answers explain the design and tradeoffs; the [submission checklist](docs/SUBMISSION.md) covers final delivery. Unsupported/unavailable test platforms stay Not tested. Optional custom thumbnails are not implemented. The development bundle and dependency-audit findings remain documented limitations.

## AI assistance

I used ChatGPT to help with implementation, debugging, test development and documentation. I directed the requirements, customized and refined the project, reviewed the behavior, and performed the local browser, phone, recovery and storage checks recorded in VERIFICATION.md. The project and its tradeoffs reflect my decisions; the verification record distinguishes automated checks from results observed in the running application.

## Storage, validation and media settings

Shared zod schemas validate metadata, file declarations, part bounds and completion.
Worker FFprobe checks actual media; extensions alone do not prove a video is valid.
The required frontend libraries have actual uses; Tailwind augments existing layout CSS.

MinIO uses server-wide origin configuration. For AWS, S3_CORS_MODE=bucket writes and
reads back GET/HEAD/PUT bucket CORS with ETag exposure. Change regional endpoints,
region, bucket, credentials and public URL; regional bucket creation is handled.
The initializer manages a public processed-media policy, so IAM/public-access
settings must permit it. Real AWS remains untested. CORS does not grant object access.

New masters include measured bandwidth and encoded dimensions. Existing playlists
are unchanged. Three heights may upscale small inputs. Generated versions are not
guaranteed to total less storage than the original; originals are currently retained.
Post-upload optimization cannot shrink the initial upload. Standard/Smooth motion presets cap output frame rate; original audio encoding settings and retained source are unchanged. Optional local compression,
source-aware presets and an explicit retention policy are future work, not required
before the current large-file assessment test.

## Making changes

Start with the source map in [ARCHITECTURE.md](ARCHITECTURE.md). Shared request rules live
in packages/contracts; change those alongside the API and relevant tests. The worker
owns encoding behavior, while the browser owns file selection and upload progress.
After a schema change, regenerate Prisma and rebuild backend/worker. For a frontend
change, rebuild frontend and refresh the browser. Re-run the checks above before committing.

The preset field defaults existing database records to Original frame rate. New upload
forms default to Smooth motion. Changing source code does not re-encode existing videos.
For the one-time upgrade procedure and reproducible preset checks, see
[docs/FINAL-UPDATE.md](docs/FINAL-UPDATE.md).
