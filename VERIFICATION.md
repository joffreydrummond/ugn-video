# Verification record

Updated October 15, 2026. Live results below were reported by Joffrey on Windows Docker Desktop. Browser versions and hardware resource measurements have not been captured. A pass for one scenario does not imply every subcase passed.

## Confirmed live results

| Scenario | Evidence / result |
| --- | --- |
| Public viewing | Incognito viewing without login and all manual qualities passed |
| Storage persistence | MinIO recreated retaining volume; poster, sound, seek and quality playback still worked |
| Worker crash | SIGKILL during 1080p encoding; same ID 0329c774-14c3-4d5c-a4f8-b8f9cf11161c automatically restarted from original and reached READY |
| Pause/resume | 435.8 MiB upload paused at 67%, subsequently uploaded and entered processing; precise resumed percentage not captured |
| Closed-tab resume | 735 MiB upload remembered at 78%; original reselected and resume reported successful |
| Upload network failure | Offline simulation interrupted transfer; reconnect and manual Resume completed upload |
| Idle cleanup | Shortened timeout 0.002 days; unfinished session subsequently absent from database and moved to browser history on refresh. Normal timeout confirmed restored to 7. Multipart before/after evidence incomplete |
| Cancellation | Paused session 28dcf88b-5a99-40ed-9d10-ce8bb9fcee8d had 4 parts / 268435456 bytes via direct ListParts. Cancellation removed DB row; same file could be selected as a fresh editable upload. Old upload ID was not captured, so storage removal remains unverified |
| Active processing Stop/Restart | User confirmed STOPPED then successful restart; public API later showed READY for stop restart test |
| Invalid media | 28-byte text renamed MP4 failed with useful message, failed again after manual retry, absent from public catalog |
| FAILED deletion | Original HEAD: 28 bytes before, 404 after; DB absent |
| READY deletion | Original present plus 83 generated objects before; original absent, generated count 0 and DB absent afterward |
| Authentication boundary | Unauthenticated GET /admin/videos and POST /uploads returned 401; GET /videos returned 200 |
| Playback API | Unauthenticated READY payload contained duration, poster, master and explicit 1080/720/480 sources; deleted ID returned NOT_FOUND with null URLs |
| Deleted link | Useful not-found message displayed in public player |
| Watch resume | Returned to 45 seconds after page refresh |
| Independent player | VLC playback, sound and seek reported working |
| Storage response headers | Master, segment and poster HEAD returned 200, correct MIME, playlist no-cache, segment/poster public max-age=3600 and CORS allowing tested localhost frontend |
| Auto adaptation | User observed rendition changes under Fast/Slow 4G throttling |
| Keyboard / quality | K, arrows, M, Tab and paused quality switching reported working; custom Space conflict fixed and tap-to-toggle retested successfully |
| Playback network failure | Offline then Try again restored playback without full-page refresh |
| Mobile setup | LAN frontend/API/storage reachable after coordinated origin/endpoints changed to computer Wi-Fi address |

## Platform matrix

| Platform | Result | Scope / limitation |
| --- | --- | --- |
| Desktop Chrome, including Incognito | Passed reported checks | Quality/ABR, resume, network retry, keyboard; exact version pending |
| Desktop Edge | Passed user report | Playback checklist; exact version pending |
| Desktop Firefox | Passed user report | Playback checklist; exact version pending |
| Samsung Galaxy S23 Ultra / Chrome | Passed user report | Play/audio, seek, all qualities, inline/rotation, lock/unlock and refresh resume; OS/browser versions pending |
| VLC desktop | Passed user report | Same master manifest, playback/audio/seek; version pending |
| Safari macOS / iOS / iPadOS | Not tested | Native Safari HLS behavior not established |
| Samsung Internet | Not tested | Chrome on Samsung does not verify Samsung Internet |
| Instagram / Facebook / TikTok webviews | Not tested | Each requires actual webview check |
| AVPlayer / ExoPlayer | Not directly tested | VLC proves independent consumption, not actual app-device compatibility |

## Automated checks

Latest prepared source before this review passed all 50 tests, backend/worker/frontend TypeScript checks; prior Vite production build passed with a large-bundle warning. Tests are mostly dependency-mocked plus a real subprocess abort/exit test; not live Docker integration.

Windows backend Prisma generation and TypeScript check passed with Prisma 6.19.3. The full current Windows suite/build result remains unconfirmed.

Supplemental TypeScript source received and combined with the latest review archive. All workspace TypeScript checks, strict checks of the new inspection scripts, and 55 tests passed in the preparation environment. Five new tests cover direct multipart snapshots, pagination, verification after database deletion, remaining orphan parts, denied storage and mismatched configuration. Vite production build checked separately. No Docker engine is available here; live snapshot/verify remains to be run on Windows.

## Open verification work

- Fix/diagnose multipart inventory: ListMultipartUploads helper returned [] while direct ListParts found saved parts. Root cause unknown. Never treat [] from this helper alone as cleanup proof.
- Verify cancelled and expired multipart deletion with captured key/upload ID surviving DB deletion; orphan scanning also depends on inventory behavior.
- Validate all metadata/file boundaries on client and server; wrong-file resume selection.
- Batch regression, queued stop, STOPPED deletion, interrupted cleanup, repeated/racing requests and exhausted crash retries.
- Remaining protected routes, logout/session invalidation behavior, direct-to-storage Network evidence and secret isolation.
- Real 10 GB+ upload/resume; actual 10-hour processing, startup and late seek; CPU/memory/disk guards.
- Native Safari and available webviews; screen-reader checks.
- Fresh isolated checkout, one-command startup and full-stack restart recovery.
- Required stack/frontend-library audit, AWS environment-only portability.
- Final docs, W1–W7, repository hygiene and final test/build evidence.

Do not claim whole requirements complete from partial subtests. No videos, secrets, signed upload URLs or confidential assessment PDF in the public repository.
