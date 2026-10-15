# Current limitations

## Implemented, awaiting updated-stack verification

- Persistent MinIO object storage; PostgreSQL and Redis persistent volumes.
- Seven-day idle upload cleanup, orphan multipart scanning, recoverable storage cleanup.
- Reconciliation of completed-upload/database/queue gaps; exhausted stalled jobs become FAILED.
- NestJS worker lifecycle, BullMQ lock/stall recovery, per-attempt DB fencing, lock-loss cancellation.
- Batch selection with sequential transfer, per-file title/description, pause/resume and cancellation.
- STOPPING/STOPPED processing lifecycle; restart and delete retain/remove originals as appropriate.
- CPU/memory limits, scratch preflight, periodic disk monitor and dead-attempt cleanup.

The updated Docker/MinIO stack has not run in the preparation environment (Docker is unavailable). Earlier short-video, resume, retry scheduling, deletion and message-display tests were reported working by Joffrey on LocalStack. Do not treat those as verification of the new storage stack.

## Remaining assessment work

- Public no-login catalog/page; manual quality selection; complete graceful playback states.
- Optional custom thumbnail; shared client/server zod form validation and media-container allowlist. Description fields and basic length/size/extension checks are included.
- Required frontend libraries/theme and meaningful shared contracts consumption.
- Verify actual rendition bandwidth/resolution, no unnecessary upscaling, adaptive switching and segment alignment.
- Host/API/storage URLs remain localhost by default; device access needs coordinated reachable origins/endpoints.
- Test 10 GB+ upload/resume, 10-hour encoding/seeking, browser/device/native playback; document exact observed results.
- Broader critical-path/live integration tests; ARCHITECTURE.md and ANSWERS.md W1-W7.

## Intentional boundaries

- Processing controls and the new queue have automated checks but still need live Docker/browser verification.
- Queue metadata persists locally; browser file handles do not. Manage the queue in one admin tab. A transfer error pauses the queue rather than skipping a file.
- Stop requires backend maintenance and a worker exit/lock release; a dead worker can delay acknowledgement until its old lock expires. Restart is disabled during STOPPING.
- Finalizing an upload briefly disables upload cancellation; use Stop processing after completion.

- Restarting an interrupted encode starts from the original. No encoding checkpoint/resume.
- PostgreSQL and Redis are not one transaction. Stable job IDs and periodic reconciliation give recoverability, not exactly-once execution.
- Cleanup requires a running backend and available dependencies. Outages defer cleanup. Storage's separate 90-day stale-multipart ceiling is a fallback, based on initiation time, not activity.
- Seven-day idle expiration uses part-signing and ListParts activity; browser polling the catalog does not extend it. Paused uploads must be resumed within that window.
- Disk monitoring is a two-second application guard, not an OS quota. It can overshoot between checks. Scratch and MinIO data share host capacity; budget for both.
- Processing concurrency is one per worker. Do not scale workers until shared-disk budgets and distributed failure scenarios are tested.
- Existing failed output objects remain available for retry/deletion and are removed when the session is deleted. Automatic purging of failed sessions is not implemented.
- The legacy-to-MinIO helper copies completed objects up to 5 GiB each and size-verifies them. Larger existing originals require a multipart-capable migration tool. New browser uploads still use multipart and allow 20 GiB.
- Existing unfinished multipart uploads cannot migrate between storage systems. Finish/cancel them before switching.
- MinIO is local development infrastructure with public reads only for videos/*; originals remain private. Real S3 needs equivalent CORS/policy configuration. Do not use local demo credentials or HTTP cookie settings as production configuration.
- Resume identity currently uses filename, size and modification time rather than a content fingerprint.
- Rate limiting, account-backed admin credentials, production migrations, CDN/private playback and stronger operational controls remain production work.

Do not commit videos, .env, signed URLs or the confidential assessment PDF.
