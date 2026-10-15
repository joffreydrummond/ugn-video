# Step 2: apply and verify

This patch changes configuration and future encoding output. It does not delete
videos, change credentials, migrate data or require another npm install. Apply only
while uploads and processing are idle. Keep existing .env credentials and media URLs.

1. Extract this ZIP and copy its contents into the project root, accepting replacement
   while preserving folders. `.env` is not included. The latest picker fix is assumed
   to have already been applied.
2. Add/update these settings in .env (do not duplicate keys):

```dotenv
FRONTEND_ORIGIN=http://192.168.1.195:5173
FRONTEND_ORIGINS=http://localhost:5173,http://192.168.1.195:5173
S3_CORS_MODE=minio
```

Keep S3_ENDPOINT=http://minio:9000 and the existing LAN S3_BROWSER_ENDPOINT and
S3_PUBLIC_URL so both desktop and phone can reach media. Use your actual Wi-Fi IP
if it changes. Keep credentials and JWT secret as they are. Never commit .env.

3. In PowerShell at the project root, run each command separately; stop if one fails:

```powershell
docker compose config --quiet
npm.cmd run check
npm.cmd test
docker compose build backend worker storage-init
docker compose up -d --no-deps --wait minio
docker compose run --rm --no-deps storage-init
docker compose up -d --no-deps --wait backend worker
```

Expected initialization JSON: corsMode minio and both origins. Do not remove volumes.
No frontend rebuild is needed for this patch. The tests should report 70 passes.
There is no frontend build npm script; optional production build is:
`npm.cmd exec -w @ugn/frontend -- vite build`.

4. Check API origin responses without logging in:

```powershell
curl.exe -s -D - -o NUL -H "Origin: http://localhost:5173" http://localhost:3000/videos
curl.exe -s -D - -o NUL -H "Origin: http://192.168.1.195:5173" http://localhost:3000/videos
curl.exe -s -D - -o NUL -H "Origin: http://unlisted.invalid" http://localhost:3000/videos
```

First two must return their matching Access-Control-Allow-Origin. The unlisted
origin must NOT receive an Access-Control-Allow-Origin header. Public curl can still
receive HTTP 200: CORS controls browser access, not authentication.

5. Open localhost:5173/#/admin on the PC and 192.168.1.195:5173/#/watch on the phone.
   Confirm PC sign-in/catalog and phone playback. Then upload ONE short valid video
   from the PC and wait for READY. Confirm quality selection/playback on both.
   New master.m3u8 must include RESOLUTION and AVERAGE-BANDWIDTH alongside BANDWIDTH.
   Existing video masters will not acquire these fields automatically.

6. Inventory diagnosis comes next, with an unfinished upload deliberately paused
   after at least one completed part. Before canceling, capture its exact session ID:

```powershell
docker compose exec -T backend npx tsx infra/inspect-storage.ts
docker compose exec -T backend npx tsx infra/inspect-storage.ts inventory-all
```

Compare inventory with direct tracked-session results. Do not interpret an empty
list as successful cleanup. Save snapshot SESSION_ID BEFORE cancellation; use the
snapshot/verify procedure in STORAGE-VERIFICATION.md for the cleanup proof. Share
both outputs if listing and direct parts disagree. No orphan-sweeper workaround is
being applied without evidence of why the provider listing differs.

## Provider distinction

MinIO's pinned release returns NotImplemented for bucket CORS. Compose supplies
MINIO_API_CORS_ALLOW_ORIGIN, with the same explicit comma-separated origin list.
For AWS use S3_CORS_MODE=bucket; the initializer writes and reads back bucket CORS,
uses the regional bucket-creation constraint and never silently falls back on errors.
AWS public-access policy settings and IAM permissions must permit the intended
public processed-media policy; originals retain no anonymous grant. AWS runtime
portability remains unverified until an actual AWS test.

## Evidence in preparation

70 automated tests and workspace TypeScript pass. Vite build passes with the known
large-chunk warning. Local FFmpeg/FFprobe smoke check validates measured metadata on
a real synthetic HLS output. No Docker daemon/phone runtime is available in preparation.
