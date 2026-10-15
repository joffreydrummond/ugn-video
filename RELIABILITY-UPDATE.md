# Reliability update — install and verify

This is a full source snapshot. Copy its contents into the existing project; merge folders and replace matching files. It does **not** contain .env, node_modules, media, the assessment PDF or Git history. Keep your current .env and .git directory.

This update implements persistent MinIO storage, abandoned-upload cleanup, periodic reconciliation, NestJS worker lifecycle, ownership fencing and scratch guards. It does not complete the public viewing page, quality selector or all assessment requirements.

## 1. Before copying: finish existing activity

Using the OLD running app:

1. Let queued/processing/retrying sessions finish.
2. Finish or cancel every unfinished upload. Complete any unfinished deletion.
3. Keep one disposable READY clip to verify migration. Note its title.
4. Keep LocalStack, PostgreSQL and Redis running. **Do not run docker compose down, remove containers, or delete volumes.** LocalStack currently has no durable media volume.

The migration refuses to proceed if database records still show unfinished activity. Multipart upload IDs and parts cannot move between different storage systems. Completed originals and playback objects can be copied.

## 2. Copy the source and validate

Extract this archive to a temporary folder, then copy its contents into your existing ugn-video project. Replace matching source/configuration files. Do not replace your .env.

Save all files. Open PowerShell in the project root. Run commands separately and stop on an error:

```powershell
npx.cmd prisma generate --schema apps/backend/prisma/schema.prisma
```

```powershell
npm.cmd run check --workspaces --if-present
```

```powershell
node --import tsx --test apps/backend/tests/video-management.test.ts apps/backend/tests/recovery.test.ts
```

Expected: all workspace checks pass and 20 tests pass. Dependencies did not change, so no new install is required if the project already has its installed dependencies.

Build the updated images:

```powershell
docker compose build
```

Check configuration without printing resolved environment secrets:

```powershell
docker compose config --quiet
```

## 3. Switch storage while preserving completed media

The new storage credentials use S3_ACCESS_KEY and S3_SECRET_KEY from your existing .env. The supplied example uses ugnlocal / local-development-only-password. MinIO requires a secret of at least eight characters. Keep those example values only for local development.

Stop the application processes, leaving the old storage/database/Redis running:

```powershell
docker compose stop backend worker frontend
```

Start only MinIO:

```powershell
docker compose up -d minio
```

Wait until `docker compose ps minio` shows healthy. Then initialize the new bucket:

```powershell
docker compose run --rm --no-deps storage-init
```

Copy existing media from the still-running LocalStack container into MinIO:

```powershell
docker compose run --rm --no-deps backend npx tsx infra/migrate-storage.ts
```

Expected: “Copied and size-verified N objects. Source unchanged.” Stop if this fails. The helper streams objects; it does not stage videos on local disk. It preserves content types/cache headers and does not delete source data or database rows. Size verification is not a cryptographic checksum comparison.

Existing objects above 5 GiB need a multipart-capable migration tool; the helper will stop explicitly without deleting the source. This limit affects only copying OLD completed objects, not NEW multipart uploads, which remain capped at 20 GiB.

If the source container is stopped, use `docker compose --profile legacy start localstack` to start the existing container. **Do not use up --force-recreate for LocalStack.** If the source bucket is already missing, stop and report it rather than deleting database records.

Start the updated app:

```powershell
docker compose up -d backend worker frontend
```

The backend applies the additive nullable processingToken column using the existing db-push startup command. Worker startup waits for the backend's health check, so it cannot use the new field before the schema is ready. No destructive schema change is intended; do not accept unexpected data-loss prompts.

Check service status and logs:

```powershell
docker compose ps
```

```powershell
docker compose logs --tail=100 backend worker minio storage-init
```

Refresh the app with Ctrl+Shift+R. Play the clip noted in step 1; verify its poster, audio and seeking. The app now uses http://localhost:9000/media for media, not port 4566.

The legacy container remains available for rollback until MinIO is verified. After verification, stop it using `docker compose --profile legacy stop localstack`. Do not remove it until you no longer need the source copy.

## 4. Short-video verification, in order

### Normal workflow

1. Upload a new 20–60 second valid MP4.
2. Confirm UPLOADED → PROCESSING → READY without a page reload.
3. Verify poster, duration, playback and seeking.
4. Recheck pause/refresh/reselect/resume with a clip large enough to contain multiple 64 MiB parts.
5. Cancel a disposable unfinished upload; verify it disappears.
6. Recheck Retry/Delete. An invalid MP4 verifies rejection and retry scheduling; it does not prove successful recovery.

### Storage recreation

After all processing finishes:

```powershell
docker compose up -d --force-recreate --no-deps minio
```

Wait for healthy status, refresh, and play both the migrated clip and new clip. Originals and outputs must remain. This recreates the container while retaining mediadata; it is stronger than merely refreshing the page.

Do not use down -v: that deletes all named volumes.

### Worker crash and successful recovery

1. Upload a disposable valid 1–3 minute clip. Watch worker logs until an encoding stage starts.
2. Kill the worker while it is encoding:

```powershell
docker compose kill -s SIGKILL worker
```

3. Start the worker again:

```powershell
docker compose start worker
```

4. Allow roughly 2–3 minutes for the old 120-second lock to expire and BullMQ's stalled check to run. The session can remain PROCESSING during that interval.
5. Verify the job is picked up again, encoding restarts, and the valid clip reaches READY and plays.
6. Check logs for scratch cleanup errors. Abandoned attempt directories are checked every minute and are deleted after their Redis owner lock disappears.

Two stalled recoveries are allowed; ordinary processing errors get three attempts with exponential backoff. Exhausted jobs become FAILED through the maintenance pass (normally within one minute). No infinite resetting of failed-job retry budgets is intended.

### Accelerated idle-upload cleanup

Do this only with disposable unfinished uploads. The setting applies to ALL UPLOADING records in this project.

1. Ensure no real unfinished uploads need preservation.
2. Temporarily add this to .env:

```dotenv
UPLOAD_IDLE_DAYS=0.002
```

That is approximately 2 minutes 53 seconds. Recreate only the backend so it receives the temporary value:

```powershell
docker compose up -d --no-deps backend
```

3. Start uploading a disposable multi-part clip, pause before completion, and leave it alone. Do not refresh/reselect/resume during the idle window: ListParts and signing a part extend its activity timestamp.
4. Wait roughly four minutes including the next one-minute sweep. The idle record should disappear and its multipart upload be aborted. A READY clip must remain playable.
5. Refresh. Any stale saved upload in this browser should clear automatically, allowing a new upload.
6. Restore UPLOAD_IDLE_DAYS=7 in .env, then repeat the backend recreate command above.

For storage-level confirmation, inspect multipart state in a one-off app container (this prints IDs, not credentials):

```powershell
docker compose run --rm --no-deps backend npx tsx infra/inspect-storage.ts
```

Compare before and after expiration/cancellation. The disposable upload should no longer appear. Record the actual result in VERIFICATION.md.

## 5. Recovery behavior and boundaries

- Maintenance runs at backend startup and every minute, without overlapping passes in one process.
- Per-video PostgreSQL transaction advisory locks serialize signing/listing/completion/cancel/retry/delete and maintenance. Worker claims use the same lock so queue consumers cannot race uncommitted metadata.
- A completed original with matching size repairs an UPLOADING record to UPLOADED; a missing queue job is recreated with the same job ID. Storage errors defer repair rather than being mistaken for missing media.
- An existing active/waiting/delayed job is not stolen based on an old heartbeat. BullMQ owns lock renewal and stalled detection.
- Exhausted failed jobs are surfaced as FAILED; they require an explicit admin retry. A completed queue job without READY also becomes a visible failure.
- Idle UPLOADING records are cleaned after seven days since their last ListParts/signing activity by default. The orphan sweep also aborts untracked old multipart uploads.
- Storage-cleanup failure retains DELETING; subsequent maintenance retries it. A slow pass or unavailable backend postpones cleanup.
- MinIO's separate 90-day initiation-age ceiling is a last-resort stale-multipart safeguard; it is not the seven-day activity-based application policy. Production S3 needs its own corresponding lifecycle policy and CORS configuration.
- Original files are retained for admin retry until deletion. Interrupted encoding starts again from the original; there are no encoding checkpoints.
- Worker state updates include a per-attempt token. Lock checks run every five seconds and before publishing; detected ownership loss kills FFmpeg and aborts storage I/O.
- Scratch defaults to /work on a dedicated volume. Five-second checks enforce a 100 GiB application threshold and 512 MiB free-space reserve. These are monitored guards, not a hard filesystem quota. Allow enough disk for originals, scratch, rendered outputs and migration copies.
- The worker has a NestJS application context and shutdown hook. A normal Compose stop allows graceful shutdown until Docker's stop timeout; SIGKILL tests the ungraceful recovery path.
- Only one worker replica is intended for this local assessment setup. Broader distributed fencing and crash behavior remain integration-test work.

## 6. Commit only after local checks

```powershell
git status
```

Stage the intended source/docs changes in VS Code. Keep .env, videos and ZIP files excluded. Commit and push:

```powershell
git commit -m "Add persistent storage, idle upload cleanup, and processing recovery"
```

```powershell
git push origin main
```

## Validation performed during preparation

Prisma generation, all application TypeScript checks, storage-helper/test TypeScript checks, 20 dependency-mocked tests, static Compose parsing/dependency checks, and a local FFmpeg smoke test of the three updated rendition commands passed. No Docker engine is available in the preparation environment, so actual MinIO CORS, migration, restart and worker-crash behavior must be verified locally using the steps above. The full assessment still requires public playback/quality selection and the remaining items in LIMITATIONS.md.
