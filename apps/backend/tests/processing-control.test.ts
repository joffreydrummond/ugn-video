import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopProcessing, finishStopping } from '../src/processing-control';
import { retryVideo, deleteVideo } from '../src/video-management';
function fixture(status = 'PROCESSING') {
  let row: any = { id: 'one', status, uploadId: null, progress: 40, processingToken: 'attempt-1' };
  let job: any = { getState: async () => 'active', remove: async () => {
    if (locked) throw new Error('Job is locked by another worker');
    job = null;
  } };
  let locked = false, failStorage = false, queueFailure = false;
  let queued = 0;
  const keys = new Set(['originals/one', 'videos/one/a.ts', 'videos/one/master.m3u8', 'videos/other/a.ts']);
  const db: any = { video: {
    findUnique: async () => row ? { ...row } : null,
    updateMany: async ({ where, data }: any) => {
      if (!row || row.status !== where.status) return { count: 0 };
      row = { ...row, ...data }; return { count: 1 };
    }, deleteMany: async () => { row = null; return { count: 1 }; },
  } };
  const queue: any = { getJob: async () => job, add: async () => { if (queueFailure) throw new Error('Redis unavailable'); queued++; } };
  const s3: any = { send: async (command: any) => {
    switch (command.constructor.name) {
      case 'HeadObjectCommand': return { ContentLength: 100 };
      case 'ListObjectsV2Command':
        if (failStorage) throw new Error('S3 unavailable');
        return { Contents: [...keys].filter(Key => Key.startsWith(command.input.Prefix)).map(Key => ({ Key })) };
      case 'DeleteObjectsCommand':
        for (const obj of command.input.Delete.Objects) keys.delete(obj.Key);
        return {};
      case 'DeleteObjectCommand': keys.delete(command.input.Key); return {};
      default: throw new Error(command.constructor.name);
    }
  } };
  return { deps: { db, queue, s3, bucket: 'media' }, row: () => row, keys, queued: () => queued,
    lock: (value: boolean) => { locked = value; }, failStorage: (value: boolean) => { failStorage = value; },
    failQueue: () => { queueFailure = true; }, noJob: () => { job = null; } };
}
test('stopping a queued video removes its job and partial outputs, retaining original and other videos', async () => {
  const f = fixture('UPLOADED'); await stopProcessing(f.deps, 'one');
  assert.equal(f.row().status, 'STOPPED'); assert.equal(f.row().processingToken, null);
  assert.deepEqual([...f.keys], ['originals/one', 'videos/other/a.ts']);
});
test('active locked job stays STOPPING and keeps files until actual worker exit', async () => {
  const f = fixture(); f.lock(true);
  assert.equal((await stopProcessing(f.deps, 'one')).status, 'STOPPING');
  assert.equal(f.keys.size, 4); assert.equal(f.row().status, 'STOPPING');
  f.lock(false); await finishStopping(f.deps, 'one');
  assert.equal(f.row().status, 'STOPPED'); assert.equal(f.keys.has('originals/one'), true);
});
test('stop cleanup failure remains retryable and cannot enable restart prematurely', async () => {
  const f = fixture(); f.failStorage(true); await assert.rejects(stopProcessing(f.deps, 'one'));
  assert.equal(f.row().status, 'STOPPING'); await assert.rejects(retryVideo(f.deps, 'one'));
  f.failStorage(false); await finishStopping(f.deps, 'one'); assert.equal(f.row().status, 'STOPPED');
});
test('repeated stop is harmless and a crashed worker with no remaining job can be stopped', async () => {
  const f = fixture(); f.noJob(); await stopProcessing(f.deps, 'one'); await stopProcessing(f.deps, 'one');
  assert.equal(f.row().status, 'STOPPED'); assert.equal(f.queued(), 0);
});
test('READY, FAILED and UPLOADING are not processing-stop targets', async () => {
  for (const state of ['READY', 'FAILED', 'UPLOADING']) {
    const f = fixture(state); await assert.rejects(stopProcessing(f.deps, 'one')); assert.equal(f.keys.size, 4);
  }
});
test('STOPPED restarts using the existing original and fresh retry budget', async () => {
  const f = fixture('STOPPED'); f.noJob(); await retryVideo(f.deps, 'one');
  assert.equal(f.row().status, 'UPLOADED'); assert.equal(f.queued(), 1); assert.equal(f.keys.has('originals/one'), true);
});
test('queue failure preserves STOPPED eligibility for another restart', async () => {
  const f = fixture('STOPPED'); f.noJob(); f.failQueue(); await assert.rejects(retryVideo(f.deps, 'one'));
  assert.equal(f.row().status, 'STOPPED');
});
test('STOPPED can be deleted, removing original while preserving other sessions', async () => {
  const f = fixture('STOPPED'); f.noJob(); await deleteVideo(f.deps, 'one');
  assert.equal(f.row(), null); assert.deepEqual([...f.keys], ['videos/other/a.ts']);
});
