import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUploadKey } from '../src/upload-key';

test('queue IDs use native randomUUID when available', () => {
  const crypto: any = { randomUUID: () => 'native-id', getRandomValues: () => { throw new Error('unexpected'); } };
  assert.equal(createUploadKey(crypto), 'native-id');
});
test('LAN HTTP fallback creates a version-4 UUID without randomUUID', () => {
  const crypto: any = { getRandomValues: (bytes: Uint8Array) => { bytes.fill(255); return bytes; } };
  assert.equal(createUploadKey(crypto), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});
test('queue IDs report unsupported browser instead of silently losing selection', () => {
  assert.throws(() => createUploadKey({} as any), /browser cannot create/);
});
