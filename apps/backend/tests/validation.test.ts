import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadSchema, metadataSchema, partSchema, completeSchema, supportedContainer } from '../../../packages/contracts/src/validation';
import { MAX_BYTES } from '../../../packages/contracts/src/index';
const valid = { title: 'Session', description: '', filename: 'set.mp4', size: 1024 };
test('metadata trims title and rejects whitespace-only/overlong values', () => {
  assert.equal(metadataSchema.parse({ title: '  Set  ' }).title, 'Set');
  for (const title of ['', '   ', 'x'.repeat(201)]) assert.equal(uploadSchema.safeParse({ ...valid, title }).success, false);
  assert.equal(uploadSchema.safeParse({ ...valid, description: 'x'.repeat(5001) }).success, false);
});
test('upload validates exact maximum, empty/fractional/over-limit sizes', () => {
  assert.equal(uploadSchema.safeParse({ ...valid, size: MAX_BYTES }).success, true);
  for (const size of [0, -1, 1.5, MAX_BYTES + 1, NaN, Infinity]) assert.equal(uploadSchema.safeParse({ ...valid, size }).success, false);
});
test('container extensions accept supported case-insensitive names and reject renamed extensions', () => {
  for (const filename of ['set.MP4', 'set.mov', 'set.m4v', 'set.mkv', 'set.webm']) assert.equal(uploadSchema.safeParse({ ...valid, filename }).success, true);
  for (const filename of ['set.exe', 'set.mp4.exe', 'set', '', 'x'.repeat(256) + '.mp4']) assert.equal(uploadSchema.safeParse({ ...valid, filename }).success, false);
});
test('actual ffprobe format must be an allowed container, independent of filename', () => {
  for (const format of ['mov,mp4,m4a,3gp,3g2,mj2', 'matroska,webm']) assert.equal(supportedContainer(format), true);
  for (const format of ['avi', 'mp3', undefined, 123]) assert.equal(supportedContainer(format), false);
});
test('part signing bounds validate whole-body input', () => {
  for (const part of [1, 10000]) assert.equal(partSchema.safeParse({ part }).success, true);
  for (const body of [null, {}, { part: 0 }, { part: 10001 }, { part: '1' }, { part: 1.1 }]) assert.equal(partSchema.safeParse(body).success, false);
});
test('completion rejects duplicates, empty ETags and missing/out-of-range parts', () => {
  const part = { PartNumber: 1, ETag: '"etag"' };
  assert.equal(completeSchema.safeParse({ parts: [part] }).success, true);
  for (const parts of [[], [part, part], [{ ...part, ETag: '' }], [{ ...part, PartNumber: 10001 }]]) assert.equal(completeSchema.safeParse({ parts }).success, false);
  assert.equal(completeSchema.safeParse(null).success, false);
});
