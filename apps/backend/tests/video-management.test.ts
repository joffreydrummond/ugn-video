import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryVideo, deleteVideo } from '../src/video-management';

function fixture(status = 'FAILED') {
  let row: any = { id: 'video-1', status, title: 'Test', uploadId: 'upload-1', error: 'Old failure' };
  let state = 'failed';
  let queued = 0;
  let locked = false;
  let failDelete = false;
  let sourceExists = true;
  let queueFailure = false;
  const keys = new Set(['originals/video-1', 'videos/video-1/master.m3u8', 'videos/another/poster.jpg']);
  const db = { video: {
    findUnique: async () => row ? { ...row } : null,
    updateMany: async ({ where, data }: any) => {
      if (!row || row.status !== where.status) return { count: 0 };
      row = { ...row, ...data }; return { count: 1 };
    },
    deleteMany: async () => { row = null; return { count: 1 }; },
  } };
  let job: any = {
    getState: async () => state,
    remove: async () => { if (locked) throw new Error('locked'); job = null; },
  };
  const queue = {
    getJob: async () => job,
    add: async (_name: string, data: any, options: any) => {
      if (queueFailure) throw new Error('redis unavailable');
      assert.equal(data.id, 'video-1'); assert.equal(options.jobId, 'video-1'); queued++;
    },
  };
  const s3 = { send: async (command: any) => {
    const input = command.input;
    switch (command.constructor.name) {
      case 'HeadObjectCommand':
        if (!sourceExists) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
        return {};
      case 'AbortMultipartUploadCommand': throw Object.assign(new Error('already complete'), { name: 'NoSuchUpload' });
      case 'ListObjectsV2Command': return { Contents: [...keys].filter(key => key.startsWith(input.Prefix)).slice(0, 1000).map(Key => ({ Key })) };
      case 'DeleteObjectsCommand':
        if (failDelete) return { Errors: [{ Code: 'AccessDenied' }] };
        for (const object of input.Delete.Objects) keys.delete(object.Key);
        return {};
      case 'DeleteObjectCommand': keys.delete(input.Key); return {};
      default: throw new Error('Unexpected storage command');
    }
  } };
  return {
    deps: { db, queue, s3, bucket: 'media' } as any,
    row: () => row, queued: () => queued, keys,
    setState: (value: string) => { state = value; },
    lock: () => { locked = true; }, failStorage: (value: boolean) => { failDelete = value; },
    missingSource: () => { sourceExists = false; }, failQueue: () => { queueFailure = true; },
  };
}

test('retry reuses the original and replaces the exhausted queue job', async () => {
  const f = fixture();
  await retryVideo(f.deps, 'video-1');
  assert.equal(f.row().status, 'UPLOADED'); assert.equal(f.row().error, null); assert.equal(f.queued(), 1);
  await assert.rejects(retryVideo(f.deps, 'video-1'));
  assert.equal(f.queued(), 1);
});
test('retry refuses a missing original without changing state', async () => {
  const f = fixture(); f.missingSource();
  await assert.rejects(retryVideo(f.deps, 'video-1'), /original video is missing/);
  assert.equal(f.row().status, 'FAILED'); assert.equal(f.queued(), 0);
});
test('retry refuses an automatic retry already in the queue', async () => {
  const f = fixture(); f.setState('delayed');
  await assert.rejects(retryVideo(f.deps, 'video-1'), /queued or active/);
  assert.equal(f.queued(), 0);
});
test('queue failure leaves the session eligible for another retry', async () => {
  const f = fixture(); f.failQueue();
  await assert.rejects(retryVideo(f.deps, 'video-1'));
  assert.equal(f.row().status, 'FAILED');
});
test('delete removes more than 1000 output files and the original, preserving other videos', async () => {
  const f = fixture('READY');
  for (let i = 0; i < 1002; i++) f.keys.add(`videos/video-1/${i}.ts`);
  await deleteVideo(f.deps, 'video-1');
  assert.equal(f.row(), null);
  assert.deepEqual([...f.keys], ['videos/another/poster.jpg']);
  await deleteVideo(f.deps, 'video-1');
});
test('partial storage failure retains a retryable DELETING record', async () => {
  const f = fixture('READY'); f.failStorage(true);
  await assert.rejects(deleteVideo(f.deps, 'video-1'));
  assert.equal(f.row().status, 'DELETING');
  f.failStorage(false); await deleteVideo(f.deps, 'video-1');
  assert.equal(f.row(), null);
});
test('locked job blocks deletion without removing media', async () => {
  const f = fixture(); f.lock();
  await assert.rejects(deleteVideo(f.deps, 'video-1'), /still active/);
  assert.equal(f.row().status, 'FAILED'); assert.equal(f.keys.size, 3);
});
test('processing and queued sessions cannot be deleted', async () => {
  for (const status of ['PROCESSING', 'UPLOADED', 'RETRYING', 'UPLOADING']) {
    const f = fixture(status);
    await assert.rejects(deleteVideo(f.deps, 'video-1'));
    assert.equal(f.row().status, status); assert.equal(f.keys.size, 3);
  }
});
