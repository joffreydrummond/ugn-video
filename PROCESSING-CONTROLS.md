# Batch uploads and Stop/Restart processing

This ZIP is an incremental patch for the working reliability update. It contains only changed application/contract files, new tests and updated documentation. It does not replace docker-compose.yml, infra files, .env, dependencies or the database schema. Your locally built MinIO image and infra/package.json remain intact.

## Install while the large job is stopped

1. Leave the worker stopped. Keep MinIO, PostgreSQL and Redis running. Do not run down or remove volumes.
2. Extract the ZIP. Copy its apps and packages folders and documentation files into the existing project; merge folders and replace matching files. Save all files.
3. Run these separately from the project root; stop on any error:

```powershell
npm.cmd run check --workspaces --if-present
```

```powershell
node --import tsx --test apps/backend/tests/video-management.test.ts apps/backend/tests/recovery.test.ts apps/backend/tests/processing-control.test.ts apps/frontend/tests/upload-queue.test.ts apps/worker/tests/process.test.ts
```

Expected: all checks and 38 tests pass. There are no new packages or schema changes.

4. Build the application images, without rebuilding MinIO:

```powershell
docker compose build backend worker frontend
```

5. Start only backend and frontend first. Keep the worker stopped so the large session cannot start encoding again:

```powershell
docker compose up -d --no-deps backend frontend
```

6. Open http://localhost:5173, refresh with Ctrl+Shift+R, and sign in if needed. On the large session, click **Stop processing** and confirm. Stop any other unwanted queued videos too.
7. Wait for **STOPPED**. If the old worker lock is still present, allow roughly 2–3 minutes. The backend checks stop requests about every two seconds. STOPPING also covers unfinished storage cleanup; if it stays there longer, inspect backend logs. Do not force-delete queue jobs or files manually.

```powershell
docker compose logs --tail=100 backend
```

8. Once unwanted sessions show STOPPED, start the new worker:

```powershell
docker compose up -d --no-deps worker
```

A stopped session does not automatically resume. It remains available for **Restart processing** or **Delete session**. Restart begins encoding from the original again.

## Use multiple uploads

1. Click **Add videos**. In the Windows picker, Ctrl-click individual videos or Shift-click a range. Pick two short disposable videos for the first test.
2. Review each title and optional description before starting. Metadata locks once that file's server upload exists.
3. Click **Start / Resume queue**. Files transfer sequentially, each with its own progress and speed/ETA. Processing may run while the next video uploads.
4. Completed uploads show processing status in the queue row and full details in Sessions. Finished and cancelled items clear from the active queue automatically. The **Upload history** tab keeps the latest 50 browser-local records. Clearing history does not delete videos.
5. **Pause queue** aborts the current PUT and retains completed parts. Resume re-lists storage parts; an unfinished part can be resent.
6. After refresh, reselect the same original files (multiple selection supported), then resume. Matching uses filename, size and modification time. Browsers cannot reopen local files silently.
7. **Remove from queue** removes a file not yet uploading. **Cancel upload** aborts/cleans its saved multipart upload. Other queue items remain. Finalizing temporarily disables upload pause/cancel; once received, use the session's processing controls.
8. A network/validation error pauses the queue for attention. Resume retries the affected file rather than silently skipping it.

Use one admin tab for editing a queue. A browser upload lock prevents simultaneous runners where supported, but editing the same local queue across multiple tabs is not a supported coordination workflow.

## Processing stop behavior

- Stop is available for UPLOADED, PROCESSING and RETRYING sessions.
- The request records STOPPING. A live worker detects the request, aborts download/FFmpeg/storage I/O, waits for the child process to exit, and completes without automatic retry.
- Cleanup waits until the BullMQ job can be removed without a live worker lock. Partial playback files are deleted, while the original remains private and saved.
- Only after cleanup succeeds does the session become STOPPED. Restart/Delete stay disabled during STOPPING.
- The original can be used for Restart processing. Restart uses a fresh retry budget and encodes from the beginning.
- Delete on STOPPED removes the original, any remaining outputs and the database record.
- A worker killed through Docker can leave a lock for up to 120 seconds. Keep the backend running; cleanup continues after the lock expires.
- A storage outage retains STOPPING and cleanup retries. No early STOPPED result is intended while a live worker still owns the job.

## Short-video verification checklist

- [ ] The already-stopped large job becomes STOPPED and stays stopped when the worker starts.
- [ ] Select two short MP4s once. Both upload sequentially, retain distinct titles/descriptions, reach READY and play.
- [ ] Stop a disposable queued session; it becomes STOPPED without starting FFmpeg.
- [ ] Stop a valid video during encoding; observe STOPPING then STOPPED, with no automatic retry. Another session remains unaffected.
- [ ] Restart that stopped video without selecting/uploading again; it reaches READY and plays.
- [ ] Delete a stopped disposable video; it stays gone after refresh.
- [ ] Pause an upload spanning multiple 64 MiB parts, refresh, reselect the same originals and resume. Confirm completed parts are retained.
- [ ] Cancel one queued item while another uploads; the other file is unaffected.
- [ ] Cancel an active unfinished upload; its saved multipart upload/session is removed.
- [ ] A deliberately invalid MP4 still fails with the readable error, rather than a false READY message.

Automated checks validate helpers and subprocess exit behavior, not the full running Docker/browser integration. Record your actual local results in VERIFICATION.md.

## Commit after verification

In VS Code, stage the changed files after reviewing git status. Keep .env and ZIP/video files excluded. Suggested commit message:

```text
Add batch upload queue and stop/restart processing controls
```

Push the checkpoint after testing. The assessment still needs public playback, manual quality selection and the other items in LIMITATIONS.md.
