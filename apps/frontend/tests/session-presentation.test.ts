import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalog, presetLabel, catalogMinutes } from '../src/session-presentation';
const videos = [
  { id: 'a', title: 'Zulu set', description: 'Phoenix house', createdAt: '2026-10-01T00:00:00Z', duration: 121, poster: '' },
  { id: 'b', title: 'Alpha set', description: 'Techno', createdAt: '2026-10-02T00:00:00Z', duration: null, poster: '' },
];
test('catalog searches title/description without modifying the source order', () => {
  assert.deepEqual(filterCatalog(videos, ' PHOENIX ', 'newest').map(x => x.id), ['a']);
  assert.deepEqual(filterCatalog(videos, 'set', 'newest').map(x => x.id), ['b', 'a']);
  assert.deepEqual(videos.map(x => x.id), ['a', 'b']);
  assert.equal(filterCatalog(videos, 'missing', 'title').length, 0);
});
test('catalog sorting is stable and duration ignores unknown values', () => {
  assert.deepEqual(filterCatalog(videos, '', 'oldest').map(x => x.id), ['a', 'b']);
  assert.deepEqual(filterCatalog(videos, '', 'title').map(x => x.id), ['b', 'a']);
  assert.equal(catalogMinutes(videos), 2);
});
test('preset labels describe limits without mislabeling unknown values', () => {
  assert.equal(presetLabel('smooth'), 'Smooth motion · up to 60 fps');
  assert.equal(presetLabel('standard'), 'Standard · up to 30 fps');
  assert.equal(presetLabel(undefined), 'Original frame rate');
  assert.equal(presetLabel('typo'), 'Preset unavailable');
});

 test('spoken durations distinguish seconds, minutes, and long sessions', async () => {
  const { spokenDuration } = await import('../src/session-presentation');
  assert.equal(spokenDuration(10), 'Duration: 10 seconds');
  assert.equal(spokenDuration(1340.714), 'Duration: 22 minutes, 20 seconds');
  assert.equal(spokenDuration(36001), 'Duration: 10 hours, 1 second');
  assert.equal(spokenDuration(null), 'Duration pending');
});
