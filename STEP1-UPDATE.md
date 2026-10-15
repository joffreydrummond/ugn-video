# Step 1 — validation and frontend requirements

Apply on top of checkpoint 2d8d575. Keep the project layout and single Choose Files picker. Metadata remains per file after selection; Start / Resume stays below description and never starts automatically after reselection. Local fonts change headings/body typography to the requested Bebas Neue/Montserrat.

## Installation

1. Wait for uploads and processing to be idle; pause alone does not stop worker encoding. Copy the ZIP contents into the project root and replace matching files. Do not change .env or delete volumes.
2. Install exactly the supplied lockfile and generate host editor types:

```powershell
npm.cmd ci --ignore-scripts
npx.cmd prisma generate --schema apps/backend/prisma/schema.prisma
npm.cmd run check --workspaces --if-present
npm.cmd test
npx.cmd vite build apps/frontend
```

Expect 61 tests. Existing prepared checks passed; Docker is unavailable in the preparation environment. Build has large-bundle and dependency use-client directive warnings.

3. Rebuild affected services (worker changed for actual-container validation):

```powershell
docker compose up -d --build backend worker frontend
```

Keep existing MinIO/Postgres/Redis volumes. Startup may rerun idempotent storage initialization. Rebuilding worker while processing is active interrupts that job; perform this step idle.

4. Use your current configured origin: LAN address during phone testing, localhost with default config. Hard-refresh desktop and phone.

## Focused regression — one result at a time

1. Select a short MP4. Confirm one picker, editable title/description, familiar queue controls and new typography/icons.
2. Clear title or enter only spaces: useful validation, no upload starts. Enter a valid title and description, then start. Confirm successful upload/processing and a completion toast.
3. Test two selected files: separate metadata, one-at-a-time upload, no duplicate sessions. Fields must remain correctly associated after another row finishes.
4. Pause/close/reselect/resume an unfinished original; selecting alone must not start transfer. Existing completed parts remain reusable. Cancel and fresh-file selection remain editable.
5. Play a READY session: quality selection, keyboard Space/K, focus/Tab and watch resume still work. Check mobile width, reduced-motion setting and toast legibility.
6. Attempt an unsupported extension, zero-byte file and malformed metadata; check rejection. File picker filters are convenience only; shared/server validation is authoritative.
7. Test API validation while signed in (browser DevTools Console on admin page). This sends invalid JSON metadata only and must return 400, without creating an upload:

```javascript
fetch(`${location.protocol}//${location.hostname}:3000/uploads`, {
  method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '   ', filename: 'test.mp4', size: 100, description: '' })
}).then(async response => console.log(response.status, await response.json()));
```

8. Renamed text-as-MP4 still fails processing with a useful message and stays out of public catalog. A valid small video must reach READY. Actual AVI/other unsupported container renamed MP4 must fail actual-container validation.

Then record results in VERIFICATION/checklist. Review git diff; stage source, config, package/lockfile and documentation only. Do not commit .env, media, dist or node_modules. Commit after checks pass. Next task: direct cleanup snapshot verification, then remaining smaller tests before large media.
