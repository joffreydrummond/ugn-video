import 'reflect-metadata';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

const db = new PrismaClient();
const bucket = process.env.S3_BUCKET!;
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION,
  forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
});

// Short commands return bounded output. Encoding streams progress instead.
function run(bin: string, args: string[], onSeconds?: (seconds: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args);
    let output = '', errors = '', pending = '';
    child.stdout.on('data', (data) => {
      const text = data.toString();
      if (!onSeconds) { output = (output + text).slice(-1_000_000); return; }
      pending += text;
      let newline: number;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line.startsWith('out_time_us=')) {
          const seconds = Number(line.slice(12)) / 1_000_000;
          if (Number.isFinite(seconds) && seconds >= 0) onSeconds(seconds);
        }
      }
    });
    child.stderr.on('data', data => { errors = (errors + data.toString()).slice(-8000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(errors || `${bin} exited with code ${code}`)));
  });
}

const worker = new Worker('videos', async job => {
  const { id } = job.data;
  const video = await db.video.findUnique({ where: { id } });
  if (!video || !['UPLOADED', 'PROCESSING', 'RETRYING'].includes(video.status)) return;
  const directory = await mkdtemp('/tmp/ugn-');
  let pendingUpdate: Promise<void> = Promise.resolve();
  let lastWrite = 0;
  let highestProgress = 0;

  // Time-based throttling also refreshes ETA when the percentage hasn't changed.
  function report(progress: number, stage: string, secondsLeft: number | null, force = false) {
    const now = Date.now();
    if (!force && now - lastWrite < 2000) return;
    lastWrite = now;
    highestProgress = Math.max(highestProgress, Math.min(99, Math.floor(progress)));
    const data = {
      progress: highestProgress,
      processingStage: stage,
      processingHeartbeatAt: new Date(now),
      estimatedCompletionAt: secondsLeft !== null && Number.isFinite(secondsLeft)
        ? new Date(now + Math.max(1, secondsLeft) * 1000) : null,
    };
    pendingUpdate = pendingUpdate.then(async () => {
      await db.video.updateMany({ where: { id, status: 'PROCESSING' }, data });
    }).catch(error => console.error(`[${id}] Progress update failed:`, error));
  }

  try {
    const claimed = await db.video.updateMany({ where: { id, status: { in: ['UPLOADED', 'PROCESSING', 'RETRYING'] } }, data: {
      status: 'PROCESSING', progress: 0, error: null,
      processingStage: 'Downloading original video', estimatedCompletionAt: null,
      processingHeartbeatAt: new Date(),
    } });
    if (!claimed.count) return;
    console.log(`[${id}] Downloading original video`);
    const source = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `originals/${id}` }));
    if (!source.Body) throw new Error('The original video has no readable body.');
    await pipeline(source.Body as any, createWriteStream(`${directory}/input`));
    report(2, 'Reading video details', null, true);
    const probe = JSON.parse(await run('ffprobe', [
      '-v', 'error', '-show_format', '-show_streams', '-of', 'json', `${directory}/input`,
    ]));
    if (!probe.streams?.some((stream: any) => stream.codec_type === 'video')) {
      throw new Error('The uploaded file contains no video stream.');
    }
    const duration = Number(probe.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid media duration.');
    await db.video.update({ where: { id }, data: { duration } });
    const heights = [1080, 720, 480];
    let previousSpeed: number | null = null;

    for (let index = 0; index < heights.length; index++) {
      const height = heights[index];
      const stage = `Encoding ${height}p`;
      const started = Date.now();
      let smoothedSpeed: number | null = null;
      let sampleTime = started;
      let sampleSeconds = 0;
      console.log(`[${id}] ${stage}`);
      // Until this pass is measured, the previous pass supplies a provisional estimate.
      report(5 + index * 30, stage,
        previousSpeed ? duration * (heights.length - index) / previousSpeed + 30 : null, true);
      await run('ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats',
        '-y', '-i', `${directory}/input`, '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', `scale=-2:${height}`, '-c:v', 'libx264', '-preset', 'veryfast',
        '-threads', '2', '-pix_fmt', 'yuv420p', '-crf', '23',
        '-force_key_frames', 'expr:gte(t,n_forced*6)', '-c:a', 'aac', '-b:a', '128k',
        '-ac', '2', '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod',
        '-hls_segment_filename', `${directory}/${height}-%06d.ts`, `${directory}/${height}.m3u8`,
      ], seconds => {
        const now = Date.now();
        const encoded = Math.min(duration, seconds);
        const sampleElapsed = (now - sampleTime) / 1000;
        if (sampleElapsed >= 2 && encoded > sampleSeconds) {
          const speed = (encoded - sampleSeconds) / sampleElapsed;
          smoothedSpeed = smoothedSpeed === null ? speed : 0.8 * smoothedSpeed + 0.2 * speed;
          sampleTime = now;
          sampleSeconds = encoded;
        }
        const speed = smoothedSpeed ?? previousSpeed;
        // Future passes initially use this pass's speed; they are remeasured in turn.
        // The 30-second publishing allowance is provisional until publishing starts.
        const remaining = speed && now - started >= 5000
          ? ((duration - encoded) + duration * (heights.length - index - 1)) / speed + 30
          : null;
        report(5 + index * 30 + encoded / duration * 30, stage, remaining);
      });
      previousSpeed = duration / Math.max(0.001, (Date.now() - started) / 1000);
      report(5 + (index + 1) * 30, stage, null, true);
    }
    console.log(`[${id}] Creating thumbnail`);
    report(95, 'Creating thumbnail', null, true);
    await run('ffmpeg', ['-nostdin', '-y', '-i', `${directory}/input`, '-frames:v', '1', '-vf', 'scale=640:-2', `${directory}/poster.jpg`]);
    const names = (await readdir(directory)).filter(name => name !== 'input');
    const files = await Promise.all(names.map(async name => ({ name, size: (await stat(`${directory}/${name}`)).size })));
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let uploadedBytes = 0;
    const publishStarted = Date.now();
    report(96, 'Publishing video', null, true);
    console.log(`[${id}] Publishing ${files.length} files`);
    for (const file of files) {
      const name = file.name;
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: `videos/${id}/${name}`, Body: createReadStream(`${directory}/${name}`),
        ContentLength: file.size,
        ContentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.ts') ? 'video/mp2t' : 'image/jpeg',
        CacheControl: name.endsWith('.m3u8') ? 'no-cache' : 'public, max-age=3600',
      }));
      uploadedBytes += file.size;
      const elapsed = (Date.now() - publishStarted) / 1000;
      const remaining = elapsed >= 3 && uploadedBytes > 0 ? (totalBytes - uploadedBytes) / (uploadedBytes / elapsed) + 2 : null;
      report(96 + uploadedBytes / Math.max(1, totalBytes) * 3, 'Publishing video', remaining);
    }
    const master = '#EXTM3U\n' + heights.map((height, index) =>
      `#EXT-X-STREAM-INF:BANDWIDTH=${[6000000, 3000000, 1500000][index]}\n${height}.m3u8`).join('\n') + '\n';
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `videos/${id}/master.m3u8`, Body: master,
      ContentType: 'application/vnd.apple.mpegurl', CacheControl: 'no-cache' }));
    await pendingUpdate;
    await db.video.updateMany({ where: { id, status: 'PROCESSING' }, data: {
      status: 'READY', progress: 100, duration, error: null,
      processingStage: null, estimatedCompletionAt: null, processingHeartbeatAt: new Date(),
    } });
    console.log(`[${id}] Ready`);
  } catch (error) {
    await pendingUpdate;
    const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
    await db.video.updateMany({ where: { id, status: 'PROCESSING' }, data: {
      status: willRetry ? 'RETRYING' : 'FAILED', error: String(error).slice(-2000), processingStage: null,
      estimatedCompletionAt: null, processingHeartbeatAt: new Date(),
    } });
    throw error;
  } finally { await rm(directory, { recursive: true, force: true }); }
}, { connection: { host: process.env.REDIS_HOST }, concurrency: 1, lockDuration: 120000 });
worker.on('error', console.error);
worker.on('failed', (job, error) => console.error(`Job ${job?.id} failed:`, error.message));
