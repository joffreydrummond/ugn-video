# Apply the final preset and catalog update

This is a patch for the committed archive supplied October 15 at 10:59 Phoenix time.
It includes Standard/Smooth/Original processing choices, admin preset labels,
public search/sorting/presentation and updated large-file evidence. It preserves
the uploaded package.json and package-lock.json; no dependency changes are required.
Existing videos retain Original frame rate. No video is automatically reprocessed.

## 1. Apply only while uploads and processing are idle

The 12.08 GB baseline reached READY and desktop/phone playback passed before this
update. Keep its original and all Docker named volumes. Never run down -v.
Copy the patch ZIP contents into the original ugn-video root, preserving directories.
Your .env is not included and should stay unchanged. Do not apply older preset ZIPs
on top of this package.

Remove superseded tracked notes after copying their consolidated replacements.
The commands list exact files; git rm refuses local modifications rather than
silently discarding them. If any command fails, stop and inspect Git status.

```powershell
git rm -- PUBLIC-PLAYBACK-UPDATE.md UPLOAD-HISTORY-UPDATE.md PROCESSING-CONTROLS.md RELIABILITY-UPDATE.md
git rm -- STEP1-UPDATE.md STEP2-UPDATE.md MULTIPART-INVENTORY-FIX.md ASSESSMENT-AUDIT.md
git rm -- STORAGE-VERIFICATION.md LARGE-MEDIA-TEST.md DEMO-SUBMISSION.md
```

Storage/test/submission procedures now live under docs/. These commands remove
documents only; they do not access Docker volumes, credentials or media.

## 2. Regenerate and check, without reinstalling dependencies

Run separately in the original project, stopping on any failure:

```powershell
npx.cmd prisma generate --schema apps/backend/prisma/schema.prisma
npm.cmd run check
npm.cmd test
npm.cmd exec -w @ugn/frontend -- vite build
```

Expected: Prisma 6.19.3 generation, clean TypeScript, **80 passing tests**, successful
build with the known large-chunk warning. No npm audit fix or forced Prisma downgrade.

## 3. Rebuild and start in order

```powershell
docker compose build backend worker frontend
docker compose up -d --no-deps --wait backend
docker compose up -d --no-deps --wait worker frontend
docker compose ps
```

Backend startup applies the additive encodingPreset field with Prisma db push.
Existing records receive original; new UI selections default smooth. Backend must
be healthy before the new worker starts. Refresh desktop/phone pages after startup.
Rebuilding does not delete stored videos; if any schema command proposes destructive
changes, stop instead of accepting data loss.

## 4. Verify existing playback and catalog first

- Confirm the large baseline is still READY and plays on desktop and phone.
- Search for part of its title; clear search and confirm all published sessions return.
- Search for a description term, then a nonmatching term; verify Clear search feedback.
- Switch Newest/Oldest/Title order; opening any matching result still selects that session.
- Check no overflow on phone/long titles and that durations/counts are sensible.
- Existing admin cards should say Original frame rate. Search/sort do not modify storage.

## 5. Test new presets with short high-frame-rate media

Use a short source above 60 fps to prove the limits. A 30 fps source should stay
30 fps in both presets, which alone does not distinguish the cap behavior.
To create a short copy of the tested DJI source without re-encoding or editing it:

```powershell
$largeVideo = 'C:\Users\jaydr\Videos\DJI_20261011132443_0045_D.MP4'
docker compose run --rm --no-deps -v "${largeVideo}:/input/source.mp4:ro" -v "${env:TEMP}:/samples" worker ffmpeg -nostdin -y -ss 60 -i /input/source.mp4 -t 10 -map 0:v:0 -map '0:a:0?' -c copy /samples/ugn-preset-sample.mp4
explorer.exe $env:TEMP
```

This copies roughly ten seconds at a source keyframe boundary; stream copying can
make the exact duration differ. It preserves high source fps and does not allocate
another full 12 GB original. The temporary clip is outside the repository.

1. Choose the sample, title Preset standard test, select Standard, then upload.
2. Confirm preset cannot be changed after session creation and survives a page refresh.
3. After the row clears, choose the same sample again, title Preset smooth test,
   select Smooth motion and upload. Each needs its own server session.
4. Confirm labels on admin cards and READY playback/audio/seek for both.
5. Look up their IDs and verify encoded segment rates, not only the selected label:

```powershell
'SELECT id, title, status, "encodingPreset" FROM "Video" WHERE title IN (''Preset standard test'', ''Preset smooth test'') ORDER BY "createdAt";' | docker compose exec -T postgres psql -U ugn -d ugn
```

Replace SESSION_ID in this read-only probe for each video:

```powershell
docker compose exec worker ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate -of json http://minio:9000/media/videos/SESSION_ID/1080-000000.ts
```

For the 119.88 fps source, Standard should be 30000/1001 and Smooth 60000/1001.
Confirm lower qualities play as well. No promise of a specific speedup is made.
The preset is server processing after upload; audio settings and original remain.

## 6. Keyboard and screen-reader check

Tab to processing quality, help button, catalog search/sort, Watch and player controls.
Help must open on hover/focus/tap and dismiss with Escape or leaving the control.
Run Windows Narrator (Win+Ctrl+Enter) with Edge and record meaningful spoken names,
selection states and any inaccessible control. Stop with the same shortcut. Test
feedback from invalid title/search/no-match states. This is manual evidence, not
full accessibility certification; do not mark passed before the user performs it.

## 7. Review, commit and submit

Update VERIFICATION.md/checklist only with actual results. Retain ten-hour/Safari/
webview/AWS omissions and the unpatched dependency advisory where applicable.
Inspect the diff before staging. No .env, media, presigned URLs or assessment PDF.

```powershell
git status --short
git diff --check
git add apps packages docs README.md ARCHITECTURE.md ANSWERS.md COST-ESTIMATE.md VERIFICATION.md LIMITATIONS.md UGN-COMPLETION-CHECKLIST.md
git diff --cached --check
git diff --cached --stat
```

Only commit after local regression passes. Suggested message:
`feat: add processing presets and improve session browsing`.
Push, confirm a clean status, and record the final hash. A live demo may be offered;
a recorded demo is recommended, not required. Final email is sent by Joffrey;
no further pushes after sending.
