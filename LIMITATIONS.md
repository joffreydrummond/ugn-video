# Limitations

Current as of October 15, 2026. See VERIFICATION.md for precise test evidence.

## Remaining assessment evidence

10 GB+ upload and true ten-hour processing/startup/late-seek measurements are pending.
Safari/iPhone/iPad, Samsung Internet, in-app webviews, actual AVPlayer/ExoPlayer and
screen-reader checks are unverified. AWS was not deployed; bucket CORS/region support
has source tests, not a real-account portability guarantee. Clean checkout at 5029615
passed with new volumes; cached Docker images/build layers may have been reused.

Cancel and tracked-expiry cleanup have been verified at the stated evidence level.
The MinIO prefix-list discrepancy was isolated and avoided by listing without Prefix
and locally filtering originals/. The provider's internal cause is not established.
Live untracked-orphan injection/expiry, interrupted deletion, active-request races,
exhausted worker retries and disk/resource pressure still need dedicated tests.

## Intentional prototype scope

- One environment-configured admin; no signup, hashed database account store, login rate
  limit, token revocation list or complete CSRF hardening. Logout clears the browser
  cookie; a copied JWT remains valid until expiry. Development credentials are placeholders.
- Browser-local queue/history/watch position; not per-user or cross-device. History
  retains 50 items. Expired uploads currently appear as Cancelled.
- File access requires reselection after tab close. Identity uses filename, byte size
  and modification time, not a cryptographic fingerprint. One editing tab is recommended;
  Web Locks are used only where available.
- Sequential 64 MiB parts, one processing job per worker and sequential rendition
  encoding trade throughput for predictable resource use. No measured scale model.
- Retries re-encode from zero. Three fixed heights may upscale low-resolution input.
  HLS bandwidth is measured, with a conservative peak ceiling, not guaranteed encoder output size.
- Optional custom thumbnails, captions, chapters, downloadable optimized MP4, DRM,
  native apps and pre-upload compression are not implemented.
- Compression after upload cannot reduce original upload traffic. Three renditions
  combined plus the retained original may use more storage than the source. No
  automatic original deletion; retention policy needs a deliberate admin decision.
- Soft scratch/free-space monitoring is not a reservation or hard quota. Originals,
  outputs and temporary copies compete for Docker host capacity.
- Cross-service coordination is recoverable, not an exactly-once transaction. Fixed
  object keys plus attempt checks are weaker than immutable attempt publication.
- Cleanup requires running backend/storage/DB/Redis. MinIO initiation-age fallback
  differs from application last-activity expiry.
- Originals are private; generated video objects are public. READY hides incomplete
  sessions from the catalog but does not prevent a guessed output URL from being fetched.
- Native playback uses feature detection; compatibility is not proven on untested devices.
  No explicit HDR tone mapping; color/rotation edge cases need broader input testing.
- NOT_FOUND playback uses HTTP 200 with a status payload. DB status is a string, and
  declared bytes use Float within the exact-integer size range rather than BigInt.
- Docker runs Vite/tsx and Prisma db push for review. Production builds/migrations,
  HTTPS, least-privilege roles, backups, metrics, alerting and hardening remain.
- Known frontend bundle warning (~1.09 MB); dependency audit reported 10 vulnerabilities
  and has not been triaged. Do not use npm audit fix --force without reviewing changes.
- Most automated tests mock storage/DB/Redis. Unit passes do not prove cloud/device/load behavior.
- Legacy migration only copies completed objects up to 5 GiB with size verification;
  it does not migrate active multipart uploads.
