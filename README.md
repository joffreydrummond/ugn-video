# UGN Video

A video publishing prototype with resumable direct-to-storage uploads, background FFmpeg processing and public adaptive HLS playback.

**Status:** core short-video flows, several failure/recovery scenarios, desktop Chrome/Edge/Firefox, Samsung S23 Ultra Chrome and VLC have been exercised. **10 GB+, 10-hour media, native Safari, full cleanup evidence and clean-install verification remain pending.** See [VERIFICATION.md](VERIFICATION.md) for precise evidence and [UGN-COMPLETION-CHECKLIST.md](UGN-COMPLETION-CHECKLIST.md) for remaining work.

## Run locally

Prerequisites: Git, Docker Desktop using Linux containers, Docker Compose, network access for first build, and enough disk space for originals plus worker copies and three renditions. Host Node.js 22 is needed only for local development/checks.

1. Clone the repository and open its root.
2. Create configuration (PowerShell):
   ```powershell
   Copy-Item .env.example .env
   ```
3. Set your local ADMIN_PASSWORD and a random JWT_SECRET of at least 32 characters. The configured single admin is ADMIN_EMAIL (default example admin@ugn.local); there is no signup or database-seeded account. MinIO credentials must match the app clients.
4. Start:
   ```powershell
   docker compose up --build
   ```

MinIO builds from pinned source using infra/Minio.Dockerfile because registry pulls failed in the development environment. The first build can take time. Storage initialization must exit 0; backend health gates worker startup. Clean-checkout startup is still awaiting independent verification.

- Public viewer: http://localhost:5173/#/watch
- Admin studio: http://localhost:5173/#/admin
- API health: http://localhost:3000/health
- S3 endpoint: http://localhost:9000 (not a management dashboard)

Keep .env untracked. .env.example contains development placeholders only. Never commit media or confidential assessment material.

## Upload and manage sessions

Open admin, sign in, choose one or multiple supported files, edit each title/optional description, then click **Start / Resume queue**. Titles allow 1–200 characters, descriptions up to 5,000. Declared file ceiling is 20 GiB; large-media support remains unproven by a real 10 GB test.

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

FFprobe verifies actual media; FFmpeg sequentially creates fixed 1080p, 720p and 480p H.264/AAC HLS, poster and duration. Estimated completion changes with measured speed; it is not a deadline. Worker concurrency is one, with Compose CPU/memory limits and application scratch/free-space guards (not hard disk quotas).

A killed worker's lock expires before stalled-job recovery. The tested job automatically restarted and reached READY. The current 120-second lock can mean roughly 2–3 minutes before recovery. Crash/retry restarts encoding from the original; no encoding checkpoints.

Public pages list READY sessions only and never require admin login. Native HLS is preferred when advertised, otherwise hls.js is used. Auto/manual quality, shareable links, useful unavailable/network states, and per-browser watch resume are implemented. Space is handled by native controls; K toggles playback, arrows seek and M mutes. Tab reaches controls.

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

To return to localhost, restore the three values from .env.example and recreate those services. LAN HTTP testing is not an internet deployment; a remote live demo needs separately configured HTTPS hosting. GitHub hosts the source, not this Docker runtime.

## Development and checks

On Windows:
```powershell
npm.cmd ci --ignore-scripts
npx.cmd prisma generate --schema apps/backend/prisma/schema.prisma
npm.cmd run check --workspaces --if-present
npm.cmd test
npx.cmd vite build apps/frontend
```

Prisma generation on the host supplies editor types; Docker generation does not update host node_modules. Restart VS Code's TypeScript server if needed. Elsewhere use npm/npx without .cmd.

The tests include queue transfer/reconciliation, management/recovery/processing controls, public serialization, playback helpers and subprocess abort behavior. Fifty passed in the preparation environment; see verification record for local versus mocked evidence.

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

**Known diagnostic issue:** infra/inspect-storage.ts's multipart inventory returned [] during a real paused upload although direct ListParts found four parts. Its output alone cannot establish cleanup. Diagnosis/fix and repeatable cleanup verification are pending.

## Remaining assessment work

See the checklist. Priorities before the large-file test: reliable cleanup inspection, validation/security/repeated-action/batch cases, required frontend libraries/theme/forms audit, clean install, documentation and final checks. Tailwind 3 theme utilities, bundled Bebas Neue/Montserrat fonts, react-hook-form upload metadata with shared zod validation, Framer Motion, lucide-react and react-hot-toast are now integrated. Existing CSS remains for established layouts; this is incremental adoption, not an all-utility rewrite. Browser regression after this change remains pending. Optional custom-thumbnail upload is not implemented.

10 GB size and 10-hour duration are distinct requirements; record actual media size/duration, resources, startup and late-seek timings. Unavailable browsers/devices must remain Not tested. ARCHITECTURE.md and ANSWERS.md W1–W7 still need final preparation/review.

## AI assistance

Joffrey directed requirements and performed the reported local tests. ChatGPT assisted with implementation, debugging, automated checks and documentation. Preparation checks are separated from actual device/runtime observations. The candidate must review, understand and be able to explain/modify all code.

## Direct cleanup verification

See STORAGE-VERIFICATION.md. The inspector now directly checks tracked multipart IDs and can save an immutable snapshot before cancellation/deletion. Pipe that snapshot into verify after deletion; a missing DB row alone is not proof. Tools are read-only and make no changes to storage, database or queue. Inventory discovery remains a separate unresolved provider behavior.

## Validation and frontend conventions update

See STEP1-UPDATE.md for installation. Shared schemas in packages/contracts/src/validation.ts validate metadata, supported filename extensions, integer size limits, signing part bounds and completion payloads. Backend invalid payloads return HTTP 400. The worker checks the actual FFprobe container and video stream/duration. Declared extension checks alone do not establish valid media. Upload fields use react-hook-form with zod errors; fonts are bundled locally rather than fetched from a font CDN. New dependency lockfile supplied. Sixty-one tests and all workspace TS checks passed in the preparation environment; live regression is pending.

## Storage configuration update

See STEP2-UPDATE.md for the ordered rebuild and verification commands. MinIO uses
server-wide origin configuration; S3_CORS_MODE=bucket instead installs and reads back
GET/HEAD/PUT bucket CORS with ETag exposure for AWS. Set the actual AWS regional
endpoint, region, credentials, bucket and public URL; creation supplies a location
constraint outside us-east-1. The initializer manages the processed-media public
policy, so the AWS account/bucket public-access settings must permit that policy.
Real AWS deployment has not been verified. CORS does not grant object access.

Newly encoded master playlists include actual encoded resolution, measured average
bitrate and a conservative segment bitrate ceiling including audio/mux overhead.
Existing published playlists are unchanged. Three fixed heights are retained,
including upscaling low-resolution input; portrait output retains its aspect ratio.

Multipart inventory is advisory. `inspect-storage.ts inventory-all` compares listing
without a prefix; snapshot/verify checks a captured upload ID directly. Live comparison isolated a prefix-listing discrepancy: unfiltered inventory finds
the same upload that direct ListParts finds. The sweeper and inspector now list
without Prefix and filter originals/ locally. Captured-ID cancellation cleanup
has passed; expiry and orphan cleanup still require separate runtime checks.
