# Current limitations

Updated October 15, 2026. Actual passed scenarios and evidence are in VERIFICATION.md; the completion checklist tracks remaining work.

## Assessment gaps

- No verified 10 GB+ upload or actual 10-hour processing/startup/late seeking yet.
- Multipart inventory returned [] despite an extant upload with four directly readable parts. Root cause unknown; cancelled/expired storage deletion and orphan discovery need reliable direct evidence.
- Full client/server zod validation, actual container allowlist and boundary testing require audit. Renamed text-as-video rejection has passed.
- Reviewed frontend package lacks required Tailwind/theme/fonts, react-hook-form/zod, Framer Motion, lucide-react and react-hot-toast. Shared-contract adoption needs audit.
- Safari/iPhone/iPad, Samsung Internet and Instagram/Facebook/TikTok webviews untested. Samsung S23 Ultra Chrome and desktop Chrome/Edge/Firefox were reported working; VLC passed.
- Resource guard behavior under load, racing/repeated requests, queued Stop, STOPPED deletion and interrupted deletion need live verification.
- Fresh isolated installation, S3 environment-only portability, docs W1–W7 and final full local checks remain.
- Optional custom-thumbnail upload is not implemented.

## Intentional boundaries

- Queue/history/watch position are browser-profile local; file access requires reselection after tab close. Resume identity is name/size/modification time, not a cryptographic fingerprint.
- Expired browser rows currently say Cancelled. History is capped at 50 and is not true per-user/server-backed history.
- Sequential 64 MiB browser parts and one job per worker; no validated multiworker capacity model.
- Encodes restart from the original after crash/retry. Fixed target heights may upscale small sources; advertised bandwidth/resolution and aspect ratios need review.
- PostgreSQL and Redis reconciliation is recoverable coordination, not an exactly-once transaction.
- CPU/memory limits and application disk monitoring are not hard disk quotas. Original storage and scratch share host capacity.
- Cleanup needs backend/dependencies running. Seven-day idle window updates on signing/listing parts; separate MinIO stale-upload fallback is based on initiation time.
- Missing playback returns HTTP 200 with a NOT_FOUND payload; richer HTTP status semantics remain a possible improvement.
- Current CORS accepts one configured origin. Localhost reviewer defaults and temporary LAN testing are separate configurations. Remote demo needs HTTPS hosting.
- One environment-configured admin, no signup or account-backed credentials. Rate limits, production migrations, private paid CDN media and operational hardening remain production work.
- Legacy migration copies completed objects up to 5 GiB, size-verifies only, and cannot migrate unfinished multipart uploads.
- Tests mostly mock dependencies. Fifty preparation tests and a successful host backend check are not a complete live integration suite.

Supplemental TypeScript files have now been received and audited. The diagnostic update adds direct session snapshots and post-deletion verification; it does not resolve the root cause of empty multipart inventory or change production cleanup behavior.
