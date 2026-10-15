# Direct storage cleanup verification

Inventory is discovery, not deletion proof. Capture the exact key/upload ID before
removing a session; then inspect that same ID after the database row is gone.
Tools are read-only. Keep saved snapshots private; they contain storage identifiers.

## Before cleanup

With a paused upload that has at least one complete part, replace SESSION_ID:

```powershell
$snapshotPath = Join-Path $env:TEMP 'ugn-storage-before.json'
$report = docker compose exec -T backend npx tsx infra/inspect-storage.ts snapshot SESSION_ID
if ($LASTEXITCODE -ne 0) { throw 'Snapshot failed; do not delete yet.' }
$report | Set-Content -Encoding UTF8 -Path $snapshotPath
Get-Content -Raw $snapshotPath
```

Confirm correct ID, multipart PRESENT and savedParts >0. For READY/FAILED/STOPPED
object-deletion tests, expect the appropriate status and originalExists true;
there may be no active multipart ID. Do not interpret NOT_CAPTURED as MPU absence.

## After cancellation/deletion/expiry

```powershell
Get-Content -Raw $snapshotPath | docker compose exec -T backend npx tsx infra/inspect-storage.ts verify
```

Expected deletionVerified true, databaseStatus ABSENT, originalExists false and
generatedFileCount 0. A captured active MPU must be ABSENT. Exit 2 means deletion
not yet verified; errors exit 1 and are not interpreted as missing data. Retry only
after reviewing state/logs, rather than using an empty inventory as proof.

Expiry tests temporarily shorten UPLOAD_IDLE_DAYS to 0.002 and recreate the backend,
close the admin tab, wait for expiry plus the 60-second maintenance interval, then
verify the saved ID. The shortened threshold applies to all idle uploads. Restore
7 and recreate/confirm the backend even if the test fails. Never discard saved
snapshots before the before/after comparison.

## Inventory and observed provider discrepancy

`inspect-storage.ts` lists without Prefix, locally selects originals/ keys and also
checks tracked multipart IDs directly. `inventory-all` lists all keys read-only.
The live MinIO setup omitted an active MPU with Prefix originals/, while unfiltered
listing returned that exact key/ID. The workaround was verified on another paused
upload; internal MinIO cause remains unknown. Both inventory and orphan cleanup now
use unfiltered listing and application-side scoping with pagination guards.

Cancellation db94fb10-52b0-419b-9f70-f43b8286be3d has pasted before/after proof: two
parts/128 MiB before, multipart ABSENT after. Tracked expiry of
492ae5a6-afe5-462c-b10e-3fd2ca4f8207 was user-confirmed with retention restored to 7.
STOPPED deletion 32762d10-f6ae-4191-a2be-51a216528b68 has pasted DB/object absence
proof; other batch videos stayed playable. Full detail: VERIFICATION.md.

These tracked-session tests do not replace a separate live untracked-orphan
injection/expiry test, nor do they prove hard-crash behavior during deletion.
