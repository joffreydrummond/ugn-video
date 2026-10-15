import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameRateFilter, renditionFilter } from '../src/encoding-preset';
import { uploadSchema } from '../../../packages/contracts/src/validation';
import { restoreQueue } from '../../frontend/src/upload-queue';
test('caps high fps and preserves integer/NTSC cadence', () => {
  assert.equal(frameRateFilter('smooth', '120000/1001'), 'fps=60000/1001');
  assert.equal(frameRateFilter('standard', '120000/1001'), 'fps=30000/1001');
  assert.equal(frameRateFilter('smooth', '120/1'), 'fps=60');
  assert.equal(frameRateFilter('standard', '60/1'), 'fps=30');
});
test('lower source fps is never raised and original policy is untouched', () => {
  for (const rate of ['24000/1001', '25/1', '30000/1001']) {
    assert.equal(frameRateFilter('standard', rate), null);
    assert.equal(frameRateFilter('smooth', rate), null);
  }
  assert.equal(frameRateFilter('original', '120000/1001'), null);
  assert.equal(renditionFilter('smooth', '120/1', 720), 'fps=60,scale=-2:720');
});
test('unknown source uses cap; unknown policy is rejected', () => {
  assert.equal(frameRateFilter('smooth', '0/0'), 'fps=60');
  assert.throws(() => frameRateFilter('typo', '30/1'));
});
test('API validates preset and old queue entries retain original behavior', () => {
  const value = { title: 'Test', description: '', filename: 'test.mp4', size: 100 };
  assert.equal(uploadSchema.parse(value).encodingPreset, 'smooth');
  assert.equal(uploadSchema.parse({ ...value, encodingPreset: 'standard' }).encodingPreset, 'standard');
  assert.equal(uploadSchema.safeParse({ ...value, encodingPreset: 'typo' }).success, false);
  const old = { key: 'one', filename: 'test.mp4', size: 100, modified: 1, state: 'paused' };
  assert.equal(restoreQueue(JSON.stringify([old]))[0].encodingPreset, 'original');
  assert.equal(restoreQueue(JSON.stringify([{ ...old, encodingPreset: 'standard' }]))[0].encodingPreset, 'standard');
});
