# UGN Video — runnable starter

This is checkpoint 1, not a completed assessment submission. Read LIMITATIONS.md before presenting it.

## Windows quick start
1. Start Docker Desktop using Linux containers.
2. Extract this folder and open it in VS Code.
3. Open Terminal > New Terminal (PowerShell).
4. Run `Copy-Item .env.example .env`.
5. Edit `.env`: set your local admin password and a random JWT secret of at least 32 characters.
6. Run `docker compose up --build` from the folder containing docker-compose.yml.
7. Wait for the API and Vite ready messages. Open http://localhost:5173.
8. Sign in using ADMIN_EMAIL and ADMIN_PASSWORD from `.env`.
9. Upload a short landscape MP4 first (20–60 seconds). Watch worker logs for processing.
10. When READY appears, click Watch session.

Stop with Ctrl+C; restart with `docker compose up`. Data persists in named volumes.
`docker compose down` stops the stack. Do not use `down -v` unless deliberately deleting all test data.

## Resume demonstration
Start a larger upload, click Pause, and wait for the current 64 MiB part to finish. Refresh, sign in if necessary, reselect the identical original file, and click Upload / Resume. Completed parts are recovered from object storage. File selection must be repeated after refresh; browsers cannot silently reopen a local file.

## Troubleshooting
- First build requires Internet access and may take several minutes.
- `docker compose logs backend worker` shows API and processing errors.
- Storage ETag errors: inspect MinIO CORS headers, especially Access-Control-Expose-Headers: ETag.
- This version uses localhost URLs. Phone testing and real S3 need additional configuration; see LIMITATIONS.md.

## Where to change things
- API, auth, multipart orchestration: apps/backend/src/main.ts
- FFmpeg processing and job recovery: apps/worker/src/main.ts
- Upload and playback UI: apps/frontend/src/main.tsx
- Styling: apps/frontend/src/style.css
- Database model: apps/backend/prisma/schema.prisma
- Services and resource limits: docker-compose.yml

## AI disclosure
ChatGPT generated the initial scaffold and implementation with Joffrey directing requirements. All generated code must be reviewed, tested, and understood before submission. Record further assistance and actual tests here.
