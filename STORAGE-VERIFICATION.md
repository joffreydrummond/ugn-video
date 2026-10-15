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
