import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileVideo, sweepOrphanUploads } from '../src/recovery';
import { withVideoLock } from '../src/video-lock';

function fixture(status = 'UPLOADED') {
  const now = new Date('2026-10-15T00:00:00Z');
  let row: any = { id: 'one', status, size: 100, uploadId: 'multipart', updatedAt: now };
  let size: number | null = 100;
  let state: string | null = null;
  let queued = 0, aborted = 0, removed = 0;
  let storageError = false, queueError = false, deletionError = false;
  let uploads: any[] = [];
  let sqlCalls = 0;
  const db: any = {
    $executeRaw: async () => { sqlCalls++; },
    $transaction: async (fn: any) => fn(db),
    video: {
      findUnique: async () => row ? { ...row } : null,
      update: async ({ data }: any) => { row = { ...row, ...data }; return { ...row }; },
      updateMany: async ({ where, data }: any) => {
        const matches = row && (typeof where.status === 'string' ? row.status === where.status : where.status.in.includes(row.status));
        if (!matches) return { count: 0 };
        row = { ...row, ...data }; return { count: 1 };
      },
      deleteMany: async () => { row = null; return { count: 1 }; },
    },
  };
  const queue: any = {
    getJob: async () => state === null ? null : ({ getState: async () => state, failedReason: 'stalled too many times', remove: async () => { removed++; state = null; } }),
    add: async (_: string, data: any, options: any) => {
      assert.equal(data.id, 'one'); assert.equal(options.jobId, 'one'); assert.equal(options.attempts, 3);
      if (queueError) throw new Error('Redis unavailable');
      queued++; state = 'waiting';
    },
  };
  const s3: any = { send: async (command: any) => {
    switch (command.constructor.name) {
      case 'HeadObjectCommand':
        if (storageError) throw new Error('storage offline');
        if (size === null) throw Object.assign(new Error('not found'), { name: 'NoSuchKey' });
        return { ContentLength: size };
      case 'ListMultipartUploadsCommand': return { Uploads: uploads };
      case 'AbortMultipartUploadCommand': aborted++; return {};
      case 'ListObjectsV2Command':
        if (deletionError) throw new Error('storage offline');
        return { Contents: [] };
      case 'DeleteObjectCommand': return {};
      default: throw new Error(command.constructor.name);
    }
  } };
  return { deps: { db, queue, s3, bucket: 'media' }, now, row: () => row,
    setSize: (value: number | null) => { size = value; }, setState: (value: string) => { state = value; },
    setDate: (date: Date) => { row.updatedAt = date; }, setUploads: (value: any[]) => { uploads = value; },
    missingRow: () => { row = null; }, failStorage: () => { storageError = true; }, failQueue: (value: boolean) => { queueError = value; },
    failDeletion: (value: boolean) => { deletionError = value; },
    counts: () => ({ queued, aborted, removed, sqlCalls }),
  };
}

test('repairs DB-to-Redis gap once using a stable queue ID', async () => {
  const f = fixture(); await reconcileVideo(f.deps, 'one'); await reconcileVideo(f.deps, 'one');
  assert.equal(f.counts().queued, 1); assert.equal(f.row().status, 'UPLOADED');
});
test('repairs storage-to-DB completion gap without reuploading bytes', async () => {
  const f = fixture('UPLOADING'); await reconcileVideo(f.deps, 'one');
  assert.equal(f.row().uploadId, null); assert.equal(f.counts().queued, 1);
});
test('Redis outage preserves repairable state and next pass queues it', async () => {
  const f = fixture('PROCESSING'); f.failQueue(true);
  await assert.rejects(reconcileVideo(f.deps, 'one'), /Redis/);
  assert.equal(f.row().status, 'UPLOADED'); f.failQueue(false);
  await reconcileVideo(f.deps, 'one'); assert.equal(f.counts().queued, 1);
});
test('active, delayed and waiting jobs are not stolen even with an old heartbeat', async () => {
  for (const state of ['active', 'delayed', 'waiting']) {
    const f = fixture('PROCESSING'); f.setState(state); f.setDate(new Date(0));
    await reconcileVideo(f.deps, 'one'); assert.equal(f.row().status, 'PROCESSING'); assert.equal(f.counts().queued, 0);
  }
});
test('exhausted stalled job becomes FAILED, without resetting retry budget', async () => {
  const f = fixture('PROCESSING'); f.setState('failed'); await reconcileVideo(f.deps, 'one');
  assert.equal(f.row().status, 'FAILED'); assert.match(f.row().error, /stalled/); assert.equal(f.counts().queued, 0);
});
test('completed job lacking READY becomes a useful visible failure', async () => {
  const f = fixture('RETRYING'); f.setState('completed'); await reconcileVideo(f.deps, 'one');
  assert.equal(f.row().status, 'FAILED');
});
test('missing original fails explicitly, transient storage errors preserve state', async () => {
  const f = fixture('PROCESSING'); f.setSize(null); await reconcileVideo(f.deps, 'one'); assert.equal(f.row().status, 'FAILED');
  const g = fixture('PROCESSING'); g.failStorage(); await assert.rejects(reconcileVideo(g.deps, 'one'));
  assert.equal(g.row().status, 'PROCESSING');
});
test('incorrect completed size is never queued', async () => {
  const f = fixture('UPLOADING'); f.setSize(99); await reconcileVideo(f.deps, 'one');
  assert.equal(f.row().status, 'FAILED'); assert.equal(f.counts().queued, 0);
});
test('idle upload is aborted and removed, recent activity retains an old upload', async () => {
  const f = fixture('UPLOADING'); f.setSize(null); f.setDate(new Date(0));
  await reconcileVideo(f.deps, 'one', f.now); assert.equal(f.row(), null); assert.equal(f.counts().aborted, 1);
  const g = fixture('UPLOADING'); g.setSize(null); await reconcileVideo(g.deps, 'one', g.now);
  assert.equal(g.row().status, 'UPLOADING'); assert.equal(g.counts().aborted, 0);
});
test('interrupted expired-upload cleanup retains DELETING and next pass finishes', async () => {
  const f = fixture('UPLOADING'); f.setSize(null); f.setDate(new Date(0)); f.failDeletion(true);
  await assert.rejects(reconcileVideo(f.deps, 'one', f.now)); assert.equal(f.row().status, 'DELETING');
  f.failDeletion(false); await reconcileVideo(f.deps, 'one'); assert.equal(f.row(), null);
});
test('orphan multipart uploads are aborted, tracked resumable uploads are retained', async () => {
  const f = fixture('UPLOADING');
  f.setUploads([{ Key: 'originals/one', UploadId: 'multipart', Initiated: new Date(0) }]);
  await sweepOrphanUploads(f.deps, f.now); assert.equal(f.counts().aborted, 0);
  f.missingRow(); await sweepOrphanUploads(f.deps, f.now); assert.equal(f.counts().aborted, 1);
});
test('lock wrapper preserves cleanup state before reporting external failure', async () => {
  const f = fixture('UPLOADING');
  await assert.rejects(withVideoLock(f.deps.db, 'one', async db => {
    await db.video.update({ where: { id: 'one' }, data: { status: 'DELETING' } });
    throw new Error('external failure');
  }));
  assert.equal(f.row().status, 'DELETING'); assert.equal(f.counts().sqlCalls, 1);
});
