# UGN completion checklist

Checkpoint: 5029615 pushed to main; October 15, 2026. This replaces older appended
progress snapshots. Detailed evidence and platform omissions: VERIFICATION.md.

| Stage | Status | Remaining gate |
| --- | --- | --- |
| 1. Validation and frontend conventions | Complete for tested scope | Shared boundaries, form errors, required libraries integrated; broader production work documented |
| 2. Storage and media configuration | Complete locally | Live inventory corrected; playlist metadata and localhost/LAN passed. Real AWS untested |
| 3. Rebuild/regression | Complete for current changes | Desktop/phone short upload/playback and quality checks passed |
| 4. Smaller checks | Planned checklist exercised | Cancel/expiry, batch, queued Stop, STOPPED deletion, auth and READY repeated actions passed; deeper untested subcases remain documented |
| 5. Clean installation/documents | Clean install passed; docs prepared | Candidate review of architecture, W1–W7, cost assumptions and final matrix |
| 6. Verified pre-large checkpoint | Implementation saved at 5029615 | Apply/review these docs, checks/build, commit/push |
| 7. Large media | Pending | Preflight, real 10 GB+ upload/resume, processing resources, actual ten-hour first-frame/late seek |
| 8. Submission | Pending | Final measurements, document updates, demo, final commit and email |

## Finish before uploading large media

- [x] Shared zod metadata/file/part/completion boundaries and LAN upload-key fallback.
- [x] Required frontend libraries/theme/fonts integrated; current upload/player regression.
- [x] Multi-origin localhost/LAN access and measured HLS master metadata.
- [x] MinIO inventory discrepancy reproduced and post-fix listing confirmed.
- [x] Captured-ID cancellation cleanup: two parts/128 MiB before, multipart absent after.
- [x] Tracked expiry verification and retention restored to 7 days (user confirmation).
- [x] Batch sequential upload/history; queued Stop; STOPPED deletion leaves other videos playable.
- [x] Protected-route 401s; wrong/correct login, refresh, logout, signed-out viewing.
- [x] Repeated completion returns 201 and READY retry 409; active-job races not tested live.
- [x] Separate checkout/Compose volumes: startup, empty catalog, short upload/playback at 5029615.
- [x] Architecture/W1–W7/cost model prepared; review these as candidate-owned answers.
- [ ] Run final TypeScript/test/build checks, review staged files, commit documentation.
- [ ] Inspect exact large media size/duration/codecs and available host/Docker disk.

## Large-media evidence

Use LARGE-MEDIA-TEST.md. A large file and a long-duration file prove different things.

- [ ] Exact filename, bytes, duration, resolution, frame rate and codecs recorded.
- [ ] Browser PUTs go to storage, metadata/signing requests to API; capture redacted evidence.
- [ ] Pause/closed-tab resume continues confirmed parts, then completes.
- [ ] Stored original bytes equal declared file size; READY reached.
- [ ] Processing wall time, peak CPU/memory and scratch usage measured.
- [ ] Published duration matches probe and all three qualities play.
- [ ] True ten-hour sample: cold startup and late seek to 07:42:10 timed, segment requests observed.
- [ ] Record any failures honestly; do not mark ten-hour coverage from a shorter 11.2 GB source.

## Final review and delivery

- [ ] Browser/device versions captured where possible; unavailable platforms remain Not tested.
- [ ] Dependency findings reviewed or explicitly retained as a limitation.
- [ ] README links/runnable commands, architecture and W1–W7 reviewed.
- [ ] No .env, secrets in history, media, archives, assessment PDF or dependency folders tracked.
- [ ] Meaningful final commit pushed; clean working tree and public repository accessible.
- [ ] Optional 5–10 minute demo link tested in a signed-out browser.
- [ ] Approximate hours entered by Joffrey; no invented duration of effort.
- [ ] Submission email sent by Joffrey before deadline; no further pushes afterward.
