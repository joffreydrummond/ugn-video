import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectSession } from '../../../infra/storage-inspection';

function fixture() {
  let row: any = { status: 'UPLOADING', uploadId: 'saved-id' };
  let removed = false;
  let deny = false;
  const calls: any[] = [];
  const deps: any = {
    bucket: 'media', endpoint: 'http://minio:9000',
    db: { video: { findUnique: async () => row } },
    s3: { send: async (command: any) => {
      calls.push(command);
      if (deny) throw Object.assign(new Error('denied'), { name: 'AccessDenied' });
      switch (command.constructor.name) {
        case 'HeadBucketCommand': return {};
        case 'HeadObjectCommand': throw Object.assign(new Error('missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
        case 'ListObjectsV2Command': return { Contents: [] };
        case 'ListPartsCommand':
          assert.equal(command.input.UploadId, 'saved-id');
          if (removed) throw Object.assign(new Error('missing'), { name: 'NoSuchUpload' });
          return command.input.PartNumberMarker
            ? { Parts: [{ Size: 20 }], IsTruncated: false }
            : { Parts: [{ Size: 10 }], IsTruncated: true, NextPartNumberMarker: '1' };
        default: throw new Error('Unexpected mutation or command');
      }
    } },
  };
  return { deps, calls, delete: () => { row = null; removed = true; }, forget: () => { row = null; }, deny: () => { deny = true; } };
}
test('snapshot captures upload identity and directly counts paginated parts', async () => {
  const f = fixture(); const r = await inspectSession(f.deps, 'one');
  assert.equal(r.multipart, 'PRESENT'); assert.equal(r.savedParts, 2); assert.equal(r.savedBytes, 30);
  assert.equal(r.snapshot.uploadId, 'saved-id'); assert.equal(r.deletionVerified, false);
});
test('saved snapshot verifies multipart removal after database record deletion', async () => {
  const f = fixture(); const before = await inspectSession(f.deps, 'one'); f.delete();
  const after = await inspectSession(f.deps, 'one', before.snapshot);
  assert.equal(after.databaseStatus, 'ABSENT'); assert.equal(after.multipart, 'ABSENT'); assert.equal(after.deletionVerified, true);
});
test('database absence cannot hide remaining multipart parts', async () => {
  const f = fixture(); const before = await inspectSession(f.deps, 'one'); f.forget();
  const after = await inspectSession(f.deps, 'one', before.snapshot);
  assert.equal(after.multipart, 'PRESENT'); assert.equal(after.deletionVerified, false);
});
test('storage denial is an error, not a successful cleanup', async () => {
  const f = fixture(); f.deny(); await assert.rejects(inspectSession(f.deps, 'one'), /denied/);
});
test('snapshots from a different storage configuration are refused', async () => {
  const f = fixture(); const before = await inspectSession(f.deps, 'one');
  await assert.rejects(inspectSession(f.deps, 'one', { ...before.snapshot, bucket: 'other' }), /does not match/);
});
