# Multipart inventory correction

Cancellation cleanup has passed with captured-ID before/after proof. The original
empty-list problem was isolated to the provider Prefix filter: unfiltered listing
returned the exact same active upload. This patch removes that filter from the
orphan sweeper and default inspector and applies originals/ scoping locally.
It does not sweep unrelated keys or shorten retention. No .env changes are needed.

Apply while uploads/processing are idle. Copy the ZIP contents into the project,
then run commands separately, stopping on failure:

```powershell
npm.cmd run check
npm.cmd test
docker compose build backend
docker compose up -d --no-deps --wait backend
```

Expected: 72 tests and healthy backend. Worker rebuild is not required for this
backend-only change. No dependency install or volume deletion is needed.

To verify the corrected listing, start an unfinished medium upload, pause after a
completed part, then run:

```powershell
docker compose exec -T backend npx tsx infra/inspect-storage.ts
```

Expected: inventory prefix null, localKeyFilter originals/, and an upload matching
the direct session result with multipart PRESENT. Capture its snapshot before any
cancellation or expiry. This same paused upload can be used for the remaining
expiry proof; do not cancel it until the next test is chosen.

Prepared evidence: 72 passing tests and all workspace TypeScript checks pass.
Live provider listing and automatic orphan expiry after this patch are pending.
