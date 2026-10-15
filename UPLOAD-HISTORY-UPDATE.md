# Upload history and clean upload form

Copy the included apps folder and documentation into the existing project, merge folders and replace matching files. No backend, worker, storage, dependency or schema changes.

- Upload videos and Upload history are separate views.
- Completed/cancelled uploads leave the active form automatically.
- Selecting a cancelled/completed file again creates a fresh queue item with editable title and description.
- Resuming an unfinished transfer preserves its server identity and metadata; its title/description remain locked intentionally.
- Pending files can be edited while another file uploads.
- Old completed/cancelled queue records are moved into history on first load.
- History keeps the latest 50 records in this browser: filename, title, description, size, date, result and current session status when available.
- This app currently has one admin identity. History is browser-local, not an account-backed audit log or cross-device history. The server session catalog remains the authoritative list of stored videos.
- Clear upload history removes history only; it does not delete media or unfinished uploads.

Save all files. Run:

```powershell
npm.cmd run check --workspaces --if-present
```

```powershell
node --import tsx --test apps/frontend/tests/upload-queue.test.ts
```

Expected: frontend queue tests 9 passed. Full test suite now totals 38 tests.

Rebuild only frontend:

```powershell
docker compose up -d --build --no-deps frontend
```

Refresh with Ctrl+Shift+R. Upload a short clip and verify the form clears and a history record appears. Cancel a disposable unfinished upload, select that same file again, and verify the new title/description fields are editable. Confirm clearing history does not remove the session cards below. Do not refresh during an active upload solely to install this visual update; pause the queue first and reselect originals afterward if needed.
