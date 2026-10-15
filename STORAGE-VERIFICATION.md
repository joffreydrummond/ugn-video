# Read-only storage verification on Windows

The bucket inventory can return [] even though a specific upload has parts. This tool directly inspects tracked upload IDs and keeps the identity across database deletion. It diagnoses the mismatch; the provider inventory root cause remains unresolved.

## Install once

Copy the package files into the project root, preserving folders. Rebuild backend only while uploads are idle:

```powershell
docker compose up -d --build --no-deps backend
```

No migration, volume deletion or storage recreation is needed. Ordinary tests run with npm.cmd test (55 expected in this revision).

## Cancellation test — capture before cancelling

1. Start a fresh disposable upload, pause after at least one completed 64 MiB part.
2. Get its exact ID (do not filter by typed title):

```powershell
'SELECT id, title, status FROM "Video" WHERE status = ''UPLOADING'' ORDER BY "createdAt" DESC;' | docker compose exec -T postgres psql -U ugn -d ugn
```

3. Replace SESSION_ID below with that ID and capture the report outside the repository. Set-Content runs only if the command succeeded:

```powershell
$cleanupSnapshot = Join-Path $env:TEMP "ugn-cleanup-before.json"
$cleanupReport = docker compose exec -T backend npx tsx infra/inspect-storage.ts snapshot SESSION_ID
if ($LASTEXITCODE -ne 0) { throw "Snapshot failed. Do not cancel yet." }
$cleanupReport | Set-Content -Encoding UTF8 -Path $cleanupSnapshot
Get-Content -Raw $cleanupSnapshot
```

Expect databaseStatus UPLOADING, multipart PRESENT, savedParts >= 1. snapshot.uploadId must be populated. Do not proceed if not. The snapshot is diagnostic metadata; do not commit it.

4. Click Cancel upload. Then verify using the SAME saved snapshot:

```powershell
Get-Content -Raw $cleanupSnapshot | docker compose exec -T backend npx tsx infra/inspect-storage.ts verify
```

Expect databaseStatus ABSENT, multipart ABSENT, originalExists false, generatedFileCount 0, deletionVerified true. Verification uses the captured upload ID even after the DB row disappears. Remaining objects/parts return exit code 2; storage/configuration errors return 1, not a false success.

## Expiration test

Use only disposable unfinished uploads. Capture a PRESENT snapshot with the normal seven-day timeout first. Close the admin tab. Set UPLOAD_IDLE_DAYS=0.002 in .env and recreate backend without rebuild. Wait four minutes, then pipe the saved snapshot into verify. Confirm the record and parts are absent. Restore UPLOAD_IDLE_DAYS=7 and recreate backend even if verification fails.

## READY/FAILED/STOPPED deletion

Snapshot an existing disposable session before deleting it, then pipe the same report into verify afterward. Original and generated file counts should change to absent/zero. READY sessions have no active multipart ID; the snapshot establishes which object prefix was checked. Inventory of old orphan upload IDs is not implied by this per-session object test.

## Inventory mode

```powershell
docker compose exec backend npx tsx infra/inspect-storage.ts
```

This prints bucket multipart inventory AND direct checks of tracked UPLOADING/DELETING rows. Empty inventory alone explicitly is not proof of cleanup. No mutations are performed.

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
