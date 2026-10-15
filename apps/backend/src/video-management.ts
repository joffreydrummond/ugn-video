import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  S3Client, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,
  DeleteObjectCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';

type Dependencies = { db: PrismaClient; queue: Queue; s3: S3Client; bucket: string };
const emptyProgress = { progress: 0, processingStage: null, estimatedCompletionAt: null, processingHeartbeatAt: null };
function missing(error: any) {
  return error?.name === 'NotFound' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404;
}

export async function retryVideo({ db, queue, s3, bucket }: Dependencies, id: string) {
  const video = await db.video.findUnique({ where: { id } });
  if (!video) throw new NotFoundException('Session not found.');
  if (video.status !== 'FAILED') throw new ConflictException('Only failed sessions can be retried.');
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: `originals/${id}` }));
  } catch (error) {
    if (missing(error)) throw new BadRequestException('The original video is missing. Upload the file again.');
    throw error;
  }
  const job = await queue.getJob(id);
  const state = job ? await job.getState() : null;
  if (state && state !== 'failed' && state !== 'completed' && state !== 'unknown') {
    throw new ConflictException('This session already has a queued or active job. Wait for it to finish.');
  }
  // A conditional state transition ensures only one request can claim the retry.
  const claimed = await db.video.updateMany({ where: { id, status: 'FAILED' }, data: {
    status: 'UPLOADED', error: null, ...emptyProgress,
  } });
  if (!claimed.count) throw new ConflictException('Session changed. Refresh and try again.');
  try {
    if (job) await job.remove(); // remove rejects if the job became active
    await queue.add('process', { id }, {
      jobId: id, attempts: 3, backoff: { type: 'exponential', delay: 5000 },
    });
  } catch (error) {
    await db.video.updateMany({ where: { id, status: 'UPLOADED' }, data: {
      status: 'FAILED', error: 'Could not queue processing. Please retry.',
    } });
    throw error;
  }
  return { ok: true };
}

export async function deleteVideo({ db, queue, s3, bucket }: Dependencies, id: string) {
  const video = await db.video.findUnique({ where: { id } });
  if (!video) return { ok: true }; // Repeating a completed deletion is harmless.
  if (!['READY', 'FAILED', 'DELETING'].includes(video.status)) {
    throw new ConflictException('Wait for processing to finish. For unfinished uploads, use Cancel.');
  }
  if (video.status !== 'DELETING') {
    const claimed = await db.video.updateMany({ where: { id, status: video.status }, data: {
      status: 'DELETING', error: null, processingStage: null, estimatedCompletionAt: null,
    } });
    if (!claimed.count) throw new ConflictException('Session changed. Refresh and try again.');
  }
  try {
    const job = await queue.getJob(id);
    if (job) {
      // BullMQ atomically refuses to remove locked jobs. Never delete media while encoding.
      try { await job.remove(); }
      catch {
        if (video.status !== 'DELETING') {
          await db.video.updateMany({ where: { id, status: 'DELETING' }, data: {
            status: video.status, error: video.error,
          } });
        }
        throw new ConflictException('The processing job is still active. Wait, then try again.');
      }
    }
    if (video.uploadId) {
      try {
        await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: `originals/${id}`, UploadId: video.uploadId }));
      } catch (error: any) {
        if (error?.name !== 'NoSuchUpload' && !missing(error)) throw error;
      }
    }
    // Repeatedly remove the first page; this also covers prefixes with >1,000 files.
    // A slash after the ID ensures another video's prefix can never match.
    while (true) {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `videos/${id}/`, MaxKeys: 1000 }));
      const objects = (page.Contents ?? []).flatMap(item => item.Key ? [{ Key: item.Key }] : []);
      if (!objects.length) break;
      const result = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
      if (result.Errors?.length) throw new Error('Storage could not delete some video files. Try Delete again.');
    }
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `originals/${id}` }));
    // Remove the record last so an interrupted cleanup can be retried.
    await db.video.deleteMany({ where: { id, status: 'DELETING' } });
    return { ok: true };
  } catch (error) {
    await db.video.updateMany({ where: { id, status: 'DELETING' }, data: {
      error: 'Deletion did not finish. Use Try delete again to finish removing this session.',
    } });
    throw error;
  }
}
