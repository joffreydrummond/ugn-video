import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import { removeOutputs } from './video-management';

type Deps = { db: PrismaClient; queue: Queue; s3: S3Client; bucket: string };

// Call under withVideoLock. Never delete outputs while BullMQ still has a live lock.
export async function finishStopping({ db, queue, s3, bucket }: Deps, id: string) {
  const video = await db.video.findUnique({ where: { id } });
  if (!video || video.status !== 'STOPPING') return { ok: true, status: video?.status };
  const job = await queue.getJob(id);
  if (job) {
    try { await job.remove(); }
    catch (error) {
      if (/locked/i.test(String(error))) return { ok: true, status: 'STOPPING' };
      throw error;
    }
  }
  try {
    await removeOutputs(s3, bucket, id);
    await db.video.updateMany({ where: { id, status: 'STOPPING' }, data: {
      status: 'STOPPED', error: null, processingToken: null, progress: 0,
      processingStage: null, estimatedCompletionAt: null, processingHeartbeatAt: null,
    } });
  } catch (error) {
    await db.video.updateMany({ where: { id, status: 'STOPPING' }, data: {
      error: 'Processing has been stopped. Cleanup will retry automatically before restart or deletion is enabled.',
    } });
    throw error;
  }
  return { ok: true, status: 'STOPPED' };
}

export async function stopProcessing(deps: Deps, id: string) {
  const video = await deps.db.video.findUnique({ where: { id } });
  if (!video) throw new NotFoundException('Session not found.');
  if (video.status === 'STOPPED') return { ok: true, status: 'STOPPED' };
  if (!['UPLOADED', 'PROCESSING', 'RETRYING', 'STOPPING'].includes(video.status)) {
    throw new ConflictException('Only queued or processing sessions can be stopped.');
  }
  if (video.status !== 'STOPPING') {
    const result = await deps.db.video.updateMany({ where: { id, status: video.status }, data: {
      status: 'STOPPING', error: null, processingStage: 'Stopping processing', estimatedCompletionAt: null,
    } });
    if (!result.count) throw new ConflictException('Session changed. Refresh and try again.');
  }
  return finishStopping(deps, id);
}
