# Public viewing and quality selection

## What changed

- Public catalog at http://localhost:5173/ (also #/watch); only READY sessions appear.
- Admin studio at http://localhost:5173/#/admin. The admin's Public viewing page link opens a separate tab so an active upload is not interrupted by navigation.
- Shareable session links use #/watch/<video-id>. Hash routes work with the existing Vite server without a new router dependency or server rewrite configuration.
- A shared player is used in the public page and admin studio. It includes title, description, poster, duration, native controls, manual quality selection, watch-position resume and useful unavailable/network states.
- Native HLS is preferred when canPlayType reports support. Otherwise hls.js is used if supported. Auto uses the master playlist; manual native selection uses an individual rendition playlist and attempts to preserve playback time and play/pause state.
- hls.js quality choices use actual manifest levels. Older manifests without RESOLUTION map heights from their rendition URLs, avoiding guesses based on sorted level indexes.
- Failed/non-ready/not-found payloads have no playable URLs. The public API excludes filename, uploadId and raw processing errors.
- Existing numeric renditions remain in the API; sources adds explicit per-quality URLs for native clients. Shared playback/catalog contracts are used by backend and frontend.
- Public metadata requests omit admin credentials and never call auth/me. Opening a public link does not require signing in.
- npm test now discovers the TypeScript tests on Windows and Linux without relying on shell glob expansion.

## Install

1. Pause any active browser upload before replacing the frontend. An existing worker encode can continue: this patch does not change worker code, storage configuration or the database schema.
2. Extract this patch and copy its contents into the existing project, merging folders and replacing matching files. New files under apps, packages and scripts must be included.
3. Keep your current .env, docker-compose.yml and infra files. No new dependencies or npm install are required; root package.json changes only add a test script.
4. Save all files. Run commands separately from the project root, stopping if one fails:

```powershell
npm.cmd run check --workspaces --if-present
```

```powershell
npm.cmd test
```

Expected: TypeScript checks pass and 50 tests pass. The tests include public serialization/model checks; they are not a substitute for real browser and native playback tests.

5. Rebuild/restart only backend and frontend. Keep the worker and storage running:

```powershell
docker compose up -d --build --no-deps backend frontend
```

6. Open http://localhost:5173/ and refresh with Ctrl+Shift+R. The home page is now public viewing. Use Admin studio or http://localhost:5173/#/admin for uploads/history/processing controls. Your existing admin cookie should still work there.

## Verify in your browser

1. Open a private/incognito window at http://localhost:5173/. Verify the READY catalog appears without a login prompt.
2. Open a short READY session. Check its title, description, poster, duration, sound and seeking. A play click is intentional; this version does not force autoplay.
3. Choose 480p, 720p, 1080p and Auto. Allow a brief buffer on manual switching. Verify time is preserved and playback continues appropriately. On native HLS, Auto returns to the master playlist; on hls.js it re-enables ABR.
4. Play at least 10 seconds, close/reopen or refresh the session link, and verify watch position is restored on the same browser profile. Near-finished videos restart from the beginning. Private-browser storage is temporary.
5. Use Copy session link and open it in a new private tab. It must reach the same public session without admin login.
6. Use Tab to reach controls. When the video itself has focus, test Space/K, Left/Right and M. Quality is a labeled native select control. Respect reduced-motion settings when scrolling.
7. Try #/watch/not-a-real-session to verify the not-found message. You can also use a known processing session's ID to verify the automatic ready-state polling. Failed/stopped sessions explain why they are unavailable.
8. Use browser offline mode temporarily to check the catalog/player error and Try again/Refresh recovery. Re-enable the network afterward.
9. Open #/admin and check the existing upload/history/stop/retry/delete UI plus Watch session scrolling. Select a short clip to verify the latest admin flow has not regressed.

No browser automation/runtime playback is claimed in this package: Chromium and Docker are unavailable in the preparation environment. TypeScript checks, tests and a Vite production build were run. Record actual device/version observations in VERIFICATION.md.

## Playback API and native-player verification

GET http://localhost:3000/videos returns READY catalog items, including public poster and metadata.

GET http://localhost:3000/videos/<video-id>/playback returns:

```json
{
  "id": "<video-id>",
  "title": "Example session",
  "description": "Artist and set notes",
  "status": "READY",
  "duration": 36000,
  "createdAt": "2026-10-15T00:00:00.000Z",
  "manifestUrl": "http://localhost:9000/media/videos/<video-id>/master.m3u8",
  "poster": "http://localhost:9000/media/videos/<video-id>/poster.jpg",
  "renditions": [1080, 720, 480],
  "sources": [
    { "height": 1080, "manifestUrl": "http://localhost:9000/media/videos/<video-id>/1080.m3u8" },
    { "height": 720, "manifestUrl": "http://localhost:9000/media/videos/<video-id>/720.m3u8" },
    { "height": 480, "manifestUrl": "http://localhost:9000/media/videos/<video-id>/480.m3u8" }
  ]
}
```

For a desktop native-player check, open the real manifestUrl using VLC's Media > Open Network Stream, play and seek. Record the observed result. A documented URL is not proof of AVPlayer/ExoPlayer compatibility; actual native/device tests remain required.

## Phone/device access

localhost on a phone refers to that phone, not the Windows development machine. Before device testing, configure reachable API/media URLs and allowed origins. The API helper defaults to the page's hostname on port 3000; VITE_API_URL can override it if necessary. S3_PUBLIC_URL, S3_BROWSER_ENDPOINT and FRONTEND_ORIGIN must match the actual LAN/HTTPS setup; MinIO CORS must allow that origin and the relevant ports must be reachable. Recreate/rebuild affected services when changing environment values. Use HTTPS and production-appropriate cookies/CDN policies for deployment.

This patch does not claim working phone access with the unchanged localhost settings.

## Limits and remaining work

- No custom thumbnail upload yet; generated posters are used.
- Required frontend stack/theme/form-library work and broader shared job/upload contracts remain.
- Existing encoding/master-playlist accuracy and true adaptive switching still require validation, especially on iOS and native players.
- Native quality changes can briefly buffer or require another Play gesture in restrictive webviews.
- Quality selection and watch-position logic have unit checks; actual network switching, startup/seek performance, rotation/lock and screen-reader behavior require device testing.
- Long-video/10 GB, durability/crash-recovery and cleanup verification remain pending where not explicitly recorded.
- A bundle-size warning remains because hls.js is included in the frontend bundle.

After local verification, commit with:

```text
Add public session catalog and adaptive playback quality controls
```
