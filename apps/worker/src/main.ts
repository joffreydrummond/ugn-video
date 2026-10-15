import 'reflect-metadata';
import { Worker } from 'bullmq';
import { Module, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { withVideoLock } from '../../backend/src/video-lock';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { runMedia as run } from './process';

const db = new PrismaClient();
const bucket = process.env.S3_BUCKET!;
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION,
  forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
});

const scratchRoot = process.env.WORKER_TMP_ROOT || '/tmp/ugn-work';
const scratchLimit = Number(process.env.WORKER_MAX_SCRATCH_GIB || 100) * 1024 ** 3;
if (!Number.isFinite(scratchLimit) || scratchLimit < 1024 ** 3) throw new Error('Invalid scratch limit');
await mkdir(scratchRoot, { recursive: true });
const worker = new Worker('videos', async (job, lockToken) => {
  const { id } = job.data;
  const processingToken = randomUUID();
  // Queue insertion happens inside an API/maintenance transaction. Wait for that
  // transaction before checking state so a fast worker cannot see stale FAILED.
  const video = await withVideoLock(db, id, async db => {
    const video = await db.video.findUnique({ where: { id } });
    if (!video || !['UPLOADED', 'PROCESSING', 'RETRYING'].includes(video.status)) return null;
    await db.video.update({ where: { id }, data: {
      status: 'PROCESSING', processingToken, progress: 0, error: null,
      processingStage: 'Downloading original video', estimatedCompletionAt: null,
      processingHeartbeatAt: new Date(),
    } });
    return video;
  });
  if (!video) return;
  const directory = await mkdtemp(join(scratchRoot, 'ugn-'));
  const abort = new AbortController();
  let monitorBusy = false;
  const assertOwner = async (checkAbort = true) => {
    const redis = await worker.client;
    if (await redis.get(worker.toKey(String(job.id)) + ':lock') !== lockToken) {
      abort.abort(new Error('Worker lock lost. Processing will be recovered.'));
      throw abort.signal.reason;
    }
    if (checkAbort) {
      const row = await db.video.findUnique({ where: { id }, select: { status: true, processingToken: true } });
      if (!row || row.status === 'STOPPING' || row.processingToken !== processingToken) {
        abort.abort(new Error('Processing stopped by admin.'));
      }
      abort.signal.throwIfAborted();
    }
  };
  await writeFile(join(directory, 'owner.json'), JSON.stringify({ jobId: job.id, lockToken }));
  const monitor = setInterval(() => {
    if (monitorBusy) return;
    monitorBusy = true;
    void (async () => {
      await assertOwner();
      const space = await statfs(scratchRoot);
      let bytes = 0;
      for (const name of await readdir(directory)) bytes += (await stat(join(directory, name))).size;
      if (bytes > scratchLimit || space.bavail * space.bsize < 512 * 1024 ** 2) {
        throw new Error('Insufficient worker disk space. Free disk space before retrying.');
      }
    })().catch(error => abort.abort(error)).finally(() => { monitorBusy = false; });
  }, 2000);
  // AbortSignal kills ffmpeg/ffprobe and cancels downloads/uploads when ownership
  // or disk safety is lost, rather than allowing an old worker to keep publishing.
  const encode = (bin: string, args: string[], onSeconds?: (seconds: number) => void) => run(bin, args, onSeconds, abort.signal);
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
      await db.video.updateMany({ where: { id, status: 'PROCESSING', processingToken }, data });
    }).catch(error => console.error(`[${id}] Progress update failed:`, error));
  }

  try {
    await assertOwner();
    const space = await statfs(scratchRoot);
    if (video.size + 512 * 1024 ** 2 > space.bavail * space.bsize || video.size > scratchLimit) {
      throw new Error('Insufficient worker disk space. Free disk space before retrying.');
    }
    console.log(`[${id}] Downloading original video`);
    const source = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `originals/${id}` }), { abortSignal: abort.signal });
    if (!source.Body) throw new Error('The original video has no readable body.');
    await pipeline(source.Body as any, createWriteStream(`${directory}/input`), { signal: abort.signal });
    report(2, 'Reading video details', null, true);
    const probe = JSON.parse(await encode('ffprobe', [
      '-v', 'error', '-show_format', '-show_streams', '-of', 'json', `${directory}/input`,
    ]));
    if (!probe.streams?.some((stream: any) => stream.codec_type === 'video')) {
      throw new Error('The uploaded file contains no video stream.');
    }
    const duration = Number(probe.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid media duration.');
    await db.video.updateMany({ where: { id, status: 'PROCESSING', processingToken }, data: { duration } });
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
      await encode('ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats',
        '-y', '-i', `${directory}/input`, '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', `scale=-2:${height}`, '-c:v', 'libx264', '-preset', 'veryfast',
        '-maxrate', String([6000000, 3000000, 1500000][index]), '-bufsize', String([12000000, 6000000, 3000000][index]),
        '-filter_threads', '1', '-threads', '2', '-pix_fmt', 'yuv420p', '-crf', '23',
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
    await encode('ffmpeg', ['-nostdin', '-y', '-i', `${directory}/input`, '-frames:v', '1', '-filter_threads', '1', '-threads', '2', '-vf', 'scale=640:-2', `${directory}/poster.jpg`]);
    const names = (await readdir(directory)).filter(name => name !== 'input' && name !== 'owner.json');
    const files = await Promise.all(names.map(async name => ({ name, size: (await stat(`${directory}/${name}`)).size })));
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let uploadedBytes = 0;
    const publishStarted = Date.now();
    report(96, 'Publishing video', null, true);
    console.log(`[${id}] Publishing ${files.length} files`);
    for (const file of files) {
      const name = file.name;
      await assertOwner();
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: `videos/${id}/${name}`, Body: createReadStream(`${directory}/${name}`),
        ContentLength: file.size,
        ContentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.ts') ? 'video/mp2t' : 'image/jpeg',
        CacheControl: name.endsWith('.m3u8') ? 'no-cache' : 'public, max-age=3600',
      }), { abortSignal: abort.signal });
      uploadedBytes += file.size;
      const elapsed = (Date.now() - publishStarted) / 1000;
      const remaining = elapsed >= 3 && uploadedBytes > 0 ? (totalBytes - uploadedBytes) / (uploadedBytes / elapsed) + 2 : null;
      report(96 + uploadedBytes / Math.max(1, totalBytes) * 3, 'Publishing video', remaining);
    }
    const master = '#EXTM3U\n' + heights.map((height, index) =>
      `#EXT-X-STREAM-INF:BANDWIDTH=${[6000000, 3000000, 1500000][index]}\n${height}.m3u8`).join('\n') + '\n';
    await assertOwner();
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `videos/${id}/master.m3u8`, Body: master,
      ContentType: 'application/vnd.apple.mpegurl', CacheControl: 'no-cache' }), { abortSignal: abort.signal });
    await pendingUpdate;
    await assertOwner();
    await db.video.updateMany({ where: { id, status: 'PROCESSING', processingToken }, data: {
      status: 'READY', progress: 100, duration, error: null,
      processingStage: null, estimatedCompletionAt: null, processingHeartbeatAt: new Date(),
    } });
    console.log(`[${id}] Ready`);
  } catch (error) {
    await pendingUpdate;
    // An old worker must not mark the replacement worker's attempt as failed.
    try { await assertOwner(false); } catch { throw error; }
    const state = await db.video.findUnique({ where: { id }, select: { status: true, processingToken: true } });
    if (state?.status === 'STOPPING' && state.processingToken === processingToken) {
      console.log(`[${id}] Processing stopped by admin`);
      return; // complete this job without BullMQ retry; monitor waits for lock release
    }
    error = abort.signal.reason || error;
    const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
    await db.video.updateMany({ where: { id, status: 'PROCESSING', processingToken }, data: {
      status: willRetry ? 'RETRYING' : 'FAILED', error: String(error).slice(-2000), processingStage: null,
      estimatedCompletionAt: null, processingHeartbeatAt: new Date(),
    } });
    throw error;
  } finally { clearInterval(monitor); abort.abort(); await rm(directory, { recursive: true, force: true }); }
}, { connection: { host: process.env.REDIS_HOST }, concurrency: 1, autorun: false, lockDuration: 120000, stalledInterval: 30000, maxStalledCount: 2 });
worker.on('error', console.error);
worker.on('failed', (job, error) => console.error(`Job ${job?.id} failed:`, error.message));

// Remove scratch left by dead attempts, retaining directories with a live owner.
// The private root is shared only by this application's worker service.
async function cleanScratch() {
for (const name of await readdir(scratchRoot)) {
  if (!name.startsWith('ugn-')) continue;
  const path = join(scratchRoot, name);
  try {
    const owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8'));
    const live = await (await worker.client).get(worker.toKey(String(owner.jobId)) + ':lock');
    if (live === owner.lockToken) continue;
    await rm(path, { recursive: true, force: true });
  } catch (error: any) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    try { if (Date.now() - (await stat(path)).mtimeMs > 300000) await rm(path, { recursive: true, force: true }); }
    catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
  }
}
}
await cleanScratch();
let cleanupBusy = false;
const cleanupTimer = setInterval(() => {
  if (cleanupBusy) return;
  cleanupBusy = true;
  void cleanScratch().catch(error => console.error('Scratch cleanup deferred:', error)).finally(() => { cleanupBusy = false; });
}, 60000);

@Injectable()
class WorkerLifecycle implements OnApplicationShutdown {
  async onApplicationShutdown() { clearInterval(cleanupTimer); await worker.close(); await db.$disconnect(); s3.destroy(); }
}
@Module({ providers: [WorkerLifecycle, { provide: Worker, useValue: worker }] })
class WorkerModule {}
const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
void worker.run().catch(error => { console.error(error); process.exitCode = 1; });
