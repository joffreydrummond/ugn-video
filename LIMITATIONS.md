# Checkpoint 1: remaining assessment work

This starter has NOT been run in Docker in the generation environment (Docker unavailable). TypeScript checks are recorded separately. Do not claim runtime or device validation until performed locally.

Implemented starting path: cookie JWT login; direct multipart uploads; server ListParts resume; part-boundary pause/cancel; persisted video records; BullMQ asynchronous ffprobe / FFmpeg HLS worker; three renditions; poster; public playback API; native HLS / hls.js; per-device watch position.

Required before assessment submission:
- Validate Docker startup, MinIO CORS incl. ETag exposure and multipart resume in a real browser.
- Add lifecycle cleanup for abandoned uploads, failed processing objects, and complete-before-enqueue crash recovery.
- Add retry/delete endpoints and UI with object removal and concurrent worker cancellation handling.
- Strong file identity verification for resume beyond filename/size/modification time.
- Add optional custom thumbnail, description form, client zod/react-hook-form validation, Tailwind theme/fonts, Framer Motion, lucide and toast libraries.
- Worker currently reports completed-rendition milestones, not true FFmpeg percentage; uses temporary disk without a disk quota/preflight check. Crash retries restart transcoding from zero. Add bounded streaming output uploads (currently individual output files are read into memory), startup failure recovery, valid master rendition resolution/bandwidth from actual outputs, no upscaling, media container allowlist.
- Long media encoding and disk usage must be tested; adaptive switching/segment alignment validated.
- Add manual quality selection and actual browser/native test matrix.
- Frontend hardcodes localhost API. Configure public URLs for phone testing and deployment. Real S3 needs bucket policy/CORS/lifecycle configuration; compose MinIO is local demo only with public reads.
- Worker is a plain BullMQ entry point; convert to NestJS worker application. Move shared DTOs/schemas into contracts and use them.
- Add rate limiting/login hardening, friendly validation errors, logout.
- Add meaningful integration/unit tests, architecture diagram and seven written answers, genuine milestone commits.

Do not upload the confidential assessment PDF to a public repo.
