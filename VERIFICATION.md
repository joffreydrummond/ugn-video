# Verification record

Updated October 15, 2026. Runtime results are from Joffrey on Windows Docker Desktop.
Preparation checks run separately in the supplied source workspace. User confirmation
is distinguished from pasted output. Results do not establish every browser or scale.

## Runtime evidence

| Check | Result and evidence |
| --- | --- |
| Fresh install | Commit 5029615 cloned into C:\dev\ugn-video-clean-5029615; separate Compose project/volumes. Empty catalog, startup, test upload and playback passed by report. Docker cache was not cleared; not a cache-free image-build proof |
| Validation/frontend | Shared zod boundary tests pass; blank-title rejection and short upload/playback confirmed. LAN HTTP picker fallback fixed and confirmed |
| Localhost and phone | Both configured origins work after Step 2; new upload, phone playback and quality selection confirmed |
| New HLS metadata | Session bd61f9c0-bcbe-4297-bfd9-db28a09694bd: three master entries include BANDWIDTH, AVERAGE-BANDWIDTH and portrait resolutions 608x1080, 406x720, 270x480 |
| Storage persistence | Recreated MinIO with retained volume; prior media poster/audio/seek/qualities still worked |
| Worker crash | SIGKILL during 1080p; same ID 0329c774-14c3-4d5c-a4f8-b8f9cf11161c restarted automatically and reached READY; logged re-download and all encodes |
| Upload pause/resume | 435.8 MiB paused at 67%, then completed. Exact saved-parts delta not captured for this test |
| Closed-tab resume | 735 MiB restored at 78%; original-file reselection and manual Resume succeeded |
| Network interruption | Browser Offline interrupted transfer; reconnect/manual Resume completed |
| Inventory diagnosis/fix | Filtered ListMultipartUploads omitted an active upload; unfiltered returned same key/ID as direct ListParts. Post-fix default inspector found it using local originals/ filtering |
| Cancel cleanup | db94fb10-52b0-419b-9f70-f43b8286be3d: before 2 parts/134217728 bytes; captured-ID after: DB ABSENT, original absent, generated 0, multipart ABSENT, deletionVerified true (pasted JSON) |
| Tracked idle expiry | 492ae5a6-afe5-462c-b10e-3fd2ca4f8207: before 2 parts/134217728 bytes. Temporary 0.002-day expiry; expected verification and restoration to 7 days confirmed by user. Final JSON not pasted |
| Batch/queued Stop | Three files selected together, sequential uploads/history; batch 2 stopped while batch 1 continued, confirmed by user |
| STOPPED deletion | 32762d10-f6ae-4191-a2be-51a216528b68: DB ABSENT, original absent, generated 0, deletionVerified true. No active multipart ID captured. Batch 1 and 3 still play |
| Active Stop/restart | User confirmed stop and restart success; stop restart test later READY in public API |
| Invalid media/retry | 28-byte text renamed MP4 failed usefully, retry failed again, excluded from public catalog |
| FAILED deletion | Original 28 bytes before/404 after and DB absent |
| READY deletion | Original plus 83 generated files before; DB/original absent and generated 0 after |
| Auth routes | Anonymous admin catalog/upload create and seven upload/management routes returned 401 |
| Browser auth | Wrong password blocked, correct login persists refresh, logout hides admin controls, signed-out public playback works; user confirmed |
| Repeated actions | Concurrent completion of already-READY step 2 returned 201 twice; concurrent retry returned 409 twice (screenshot). This is not a live race test on an active job |
| Public payload/states | READY includes duration/poster/master/three sources; deleted ID NOT_FOUND/null URLs; browser useful not-found state |
| Watch resume | Refresh returned to 45 seconds |
| Storage headers | Master HLS MIME/no-cache; TS video/mp2t and JPEG image/jpeg public max-age=3600; tested allowed origin and HTTP 200 |
| Adaptive playback | Fast/Slow 4G changed resolution by user report; no quantitative switch-latency measurement |
| Keyboard/network retry | K/arrows/M/Tab and quality change passed; Space double-toggle fixed/retested; Offline then Try again continued playback |
| Independent player | VLC master playback/audio/seek reported working; does not establish AVPlayer/ExoPlayer device results |

## Platforms actually exercised

| Platform | Scope | Status |
| --- | --- | --- |
| Desktop Chrome/Incognito | Public/admin, manual qualities, throttled ABR, watch resume, keyboard, network retry | Passed reported checks; exact version not recorded |
| Desktop Edge | Playback checklist | Passed by report; version not recorded |
| Desktop Firefox | Playback checklist | Passed by report; version not recorded |
| Samsung Galaxy S23 Ultra / Chrome | LAN playback/audio/seek/quality, inline/rotation, lock/unlock, refresh resume | Passed by report; Android/Chrome versions not recorded |
| VLC desktop | HLS playback/audio/seek | Passed by report; version not recorded |
| macOS Safari, iPhone/iPad Safari | Native HLS | Not tested |
| Samsung Internet | Separate from Chrome on Samsung | Not tested |
| Instagram/Facebook/TikTok webviews | Actual in-app links | Not tested |
| AVPlayer/ExoPlayer apps | Actual native app | Not directly tested |
| Screen reader | Spoken labels/focus/announcements | Not tested; keyboard checks alone are insufficient |

## Automated/preparation checks

72 tests and all workspace TypeScript checks pass after the inventory patch.
Coverage includes upload reconciliation, shared validation boundaries, storage
snapshot verification/pagination, processing controls, recovery/idempotency,
public metadata/player models, LAN upload-key fallback and HLS metadata. Most
external dependencies are mocked. A real subprocess abort test verifies process
exit; a local FFmpeg/FFprobe smoke check produced valid measured HLS metadata.
Vite production build passed; a roughly 1.09 MB main bundle warning remains.
Windows checks were reported passing before commit 5029615; local test output was
not retained here as a machine-generated artifact. npm reported 10 vulnerabilities
(2 moderate, 8 high); dependency findings have not been triaged or claimed fixed.

## Still unverified

- Real 10 GB+ browser upload/resume and processing/resource measurements.
- Actual ten-hour output first-frame/late-seek timing, including 07:42:10.
- Disk/full-memory guard behavior under load, multiworker capacity and HDR handling.
- Untracked-orphan injection/expiry, live interrupted deletion and exhausted-crash retry budget.
- Active-job concurrent request races; wrong-content same-name/size resume identity.
- AWS deployment/IAM/public-access/CORS readback on an actual AWS account.
- Unavailable devices/webviews/screen reader and exact versions above.
- Full secret-history/dependency audit before submission.

See LARGE-MEDIA-TEST.md for the remaining measurements. Do not commit originals,
.env, captured presigned URLs or the confidential assessment PDF.
