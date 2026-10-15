# Demo and submission checklist

## Optional live demo or recording

A recording is optional. The same sequence works for a live demo; existing videos
are in the local instance only, not included when a reviewer clones the repository.

1. State the goal and show public playback without login; use a recognizable DJ set.
2. Seek, switch quality and show phone playback. Name actual devices tested.
3. Show a real large-file size, title/description and direct storage requests.
4. Show interrupted upload recovery and original-file reselection; recordings may
   skip waiting, but identify edits and include actual timestamps/measurements.
5. Show processing stage/ETA, queued Stop and successful recovery evidence.
6. Briefly show architecture, test result and captured-ID cleanup verification.
7. State limitations: tested scope, unavailable platforms and any large-media gaps.

Avoid showing .env, passwords, JWT cookies, presigned URLs or confidential assessment
pages. Use public links and review footage before sharing.

## Before the final email

- Apply/review all docs; review the recorded results in docs/LARGE-MEDIA-TEST.md and VERIFICATION.md.
- Review package/dependency audit findings; do not blindly apply forced upgrades.
- Run TypeScript, tests, frontend build and inspect Git diff/ignored files.
- Check tracked files and history for secrets, media, confidential PDF and generated
  folders. A clean working tree alone is not a secret scan.
- Commit/push, record final hash, and test repository/demo links signed out.
- Enter approximate hours honestly; AI assistance is disclosed in README.

Submission is sent by Joffrey. Required subject: Take-Home Submission - Joffrey
Drummond - Video Feature. Include repository URL, optional demo link, approximate
hours and key reviewer notes. Do not push further commits after sending.
