import { HeadObjectCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import { finishStopping } from './processing-control';
import { withVideoLock } from './video-lock';
import { deleteVideo } from './video-management';

export type RecoveryDeps = { db: PrismaClient; s3: S3Client; queue: Queue; bucket: string };
export const jobOptions = (id: string) => ({ jobId: id, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
export function missing(error: any) {
  return ['NotFound', 'NoSuchKey', 'NoSuchUpload'].includes(error?.name) || error?.$metadata?.httpStatusCode === 404;
}

// Also used after a timeout from CompleteMultipartUpload. A successful HEAD is the
// source of truth; a transient storage error never becomes a missing-file decision.
export async function originalSize(deps: RecoveryDeps, id: string): Promise<number | null> {
  try { return Number((await deps.s3.send(new HeadObjectCommand({ Bucket: deps.bucket, Key: `originals/${id}` }))).ContentLength); }
  catch (error) { if (missing(error)) return null; throw error; }
}

export async function reconcileVideo(deps: RecoveryDeps, id: string, now = new Date(), idleMs = 7 * 86400000) {
  return withVideoLock(deps.db, id, async db => {
    let video = await db.video.findUnique({ where: { id } });
    if (!video) return;
    if (video.status === 'STOPPING') return finishStopping({ ...deps, db }, id);
    if (video.status === 'UPLOADING') {
      const size = await originalSize(deps, id);
      if (size !== null) {
        video = await db.video.update({ where: { id }, data: size === video.size
          ? { status: 'UPLOADED', uploadId: null, error: null }
          : { status: 'FAILED', error: 'Uploaded size does not match the selected file. Upload the file again.' } });
      } else if (now.getTime() - video.updatedAt.getTime() > idleMs) {
        await db.video.update({ where: { id }, data: { status: 'DELETING', error: null } });
        // Called under the same lock with the transaction client, without reacquiring it.
        await deleteVideo({ ...deps, db }, id);
        return;
      } else return;
    }
    if (video.status === 'DELETING') { await deleteVideo({ ...deps, db }, id); return; }
    if (!['UPLOADED', 'PROCESSING', 'RETRYING'].includes(video.status)) return;
    const job = await deps.queue.getJob(id);
    if (job) {
      const state = await job.getState();
      // Never steal an active job based on a heartbeat or elapsed encoding time.
      // BullMQ renews locks and handles stalled jobs after a worker dies.
      if (state === 'failed' || state === 'completed') {
        await db.video.updateMany({ where: { id, status: { in: ['UPLOADED', 'PROCESSING', 'RETRYING'] } }, data: {
          status: 'FAILED', error: state === 'failed'
            ? `Processing stopped: ${String(job.failedReason || 'worker recovery attempts exhausted').slice(-1200)}`
            : 'The job ended without publishing a ready video. Retry processing.',
          processingStage: null, estimatedCompletionAt: null,
        } });
      }
      return;
    }
    const size = await originalSize(deps, id);
    if (size === null || size !== video.size) {
      await db.video.updateMany({ where: { id, status: video.status }, data: {
        status: 'FAILED', error: 'The original upload is missing or incomplete. Upload the file again.',
        processingStage: null, estimatedCompletionAt: null,
      } });
      return;
    }
    await db.video.updateMany({ where: { id, status: video.status }, data: {
      status: 'UPLOADED', progress: 0, error: null, processingStage: null, estimatedCompletionAt: null,
    } });
    // A crash between these two steps is repaired by the next pass; the stable ID
    // deduplicates concurrent queue additions. Existing failed jobs require manual retry.
    await deps.queue.add('process', { id }, jobOptions(id));
  });
}

export async function sweepOrphanUploads(deps: RecoveryDeps, now = new Date(), idleMs = 7 * 86400000) {
  let KeyMarker: string | undefined, UploadIdMarker: string | undefined;
  do {
    // This pinned MinIO instance omits active uploads when Prefix is supplied.
    // List the bucket, then scope deletion locally to original-upload keys.
    const page = await deps.s3.send(new ListMultipartUploadsCommand({ Bucket: deps.bucket, KeyMarker, UploadIdMarker, MaxUploads: 100 }));
    for (const upload of page.Uploads ?? []) {
      if (!upload.Key?.startsWith('originals/') || upload.Key === 'originals/' || !upload.UploadId || !upload.Initiated || now.getTime() - upload.Initiated.getTime() <= idleMs) continue;
      const id = upload.Key.slice('originals/'.length);
      await withVideoLock(deps.db, id, async db => {
        const row = await db.video.findUnique({ where: { id } });
        // A recently used old multipart upload is still resumable. Tracked uploads
        // are cleaned by reconcileVideo; this sweep covers create/DB failure gaps.
        if (row && row.uploadId === upload.UploadId && ['UPLOADING', 'DELETING'].includes(row.status)) return;
        try { await deps.s3.send(new AbortMultipartUploadCommand({ Bucket: deps.bucket, Key: upload.Key, UploadId: upload.UploadId })); }
        catch (error) { if (!missing(error)) throw error; }
      });
    }
    if (page.IsTruncated && (!page.NextKeyMarker || (page.NextKeyMarker === KeyMarker && page.NextUploadIdMarker === UploadIdMarker))) {
      throw new Error('Multipart inventory pagination did not advance');
    }
    KeyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    UploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
  } while (KeyMarker);
}

export async function recoveryPass(deps: RecoveryDeps, idleMs = 7 * 86400000) {
  let cursor: string | undefined;
  do {
    const rows = await deps.db.video.findMany({ where: { status: { in: ['UPLOADING', 'UPLOADED', 'PROCESSING', 'RETRYING', 'DELETING', 'STOPPING'] } },
      orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    for (const row of rows) {
      try { await reconcileVideo(deps, row.id, new Date(), idleMs); }
      catch (error) { console.error(`[${row.id}] Recovery deferred:`, error); }
    }
    if (rows.length < 100) break;
    cursor = rows[rows.length - 1].id;
  } while (cursor);
  await sweepOrphanUploads(deps, new Date(), idleMs);
}

export function startRecovery(deps: RecoveryDeps, intervalMs = 60000, idleMs = 7 * 86400000) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  async function tick() {
    try { await recoveryPass(deps, idleMs); } catch (error) { console.error('Recovery pass deferred:', error); }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  }
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}

// Fast acknowledgement for user stop requests, independently of the full sweep.
export function startStopMonitor(deps: RecoveryDeps) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  async function tick() {
    try {
      let cursor: string | undefined;
      do {
        const rows = await deps.db.video.findMany({ where: { status: 'STOPPING' }, orderBy: { id: 'asc' }, take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
        for (const row of rows) {
          try { await reconcileVideo(deps, row.id); } catch (error) { console.error(`[${row.id}] Stop cleanup deferred:`, error); }
        }
        if (rows.length < 100) break;
        cursor = rows[rows.length - 1].id;
      } while (cursor && !stopped);
    } catch (error) { console.error('Stop monitor deferred:', error); }
    if (!stopped) timer = setTimeout(() => void tick(), 2000);
  }
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}
