import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transfer, restoreQueue, sameFile, PART_SIZE, TransferInterrupted, type UploadEntry } from '../src/upload-queue';
function fixture() {
  const entry: UploadEntry = { key: 'local', filename: 'set.mp4', size: PART_SIZE + 10, modified: 123,
    title: 'Set', description: '', state: 'pending', confirmedBytes: 0, percent: 0, note: '' };
  // Only slices are materialized; no 64 MiB allocation is needed for these tests.
  const file = { name: entry.filename, size: entry.size, lastModified: 123,
    slice: (start: number, end: number) => ({ size: Math.min(entry.size, end) - start }) } as File;
  let existing: any[] = [], interrupted = false, failComplete = false;
  let creates = 0, completes = 0, puts = 0, concurrent = 0, maxConcurrent = 0;
  const events: string[] = [];
  const hooks = {
    api: async (path: string, body?: any) => {
      if (path === 'uploads') { creates++; return { id: 'server' }; }
      if (path.endsWith('/parts')) return existing;
      if (path.endsWith('/part')) { events.push(`sign:${body.part}`); return { url: String(body.part) }; }
      if (path.endsWith('/complete')) { completes++; if (failComplete) throw new Error('lost acknowledgement'); return { ok: true }; }
      throw new Error(path);
    },
    put: async (url: string, blob: Blob, progress: (loaded: number) => void) => {
      concurrent++; maxConcurrent = Math.max(concurrent, maxConcurrent); puts++; progress(blob.size);
      existing = [...existing, { PartNumber: Number(url), ETag: `etag-${url}`, Size: blob.size }];
      concurrent--; return `etag-${url}`;
    },
    update: (patch: Partial<UploadEntry>) => { Object.assign(entry, patch); },
    interrupted: () => interrupted, finalizing: () => { events.push('finalizing'); },
  };
  return { entry, file, hooks, counts: () => ({ creates, completes, puts, maxConcurrent }),
    seed: (parts: any[]) => { existing = parts; }, interrupt: () => { interrupted = true; },
    failComplete: () => { failComplete = true; }, events };
}
test('uploads one part at a time and only marks received after completion', async () => {
  const f = fixture(); await transfer(f.entry, f.file, f.hooks);
  assert.deepEqual(f.counts(), { creates: 1, puts: 2, completes: 1, maxConcurrent: 1 });
  assert.equal(f.entry.state, 'uploaded'); assert.equal(f.entry.percent, 100);
});
test('resume ignores browser byte counters and skips storage-confirmed parts', async () => {
  const f = fixture(); f.entry.serverId = 'server'; f.entry.confirmedBytes = 0;
  f.seed([{ PartNumber: 1, ETag: 'old', Size: PART_SIZE }]);
  await transfer(f.entry, f.file, f.hooks);
  assert.equal(f.counts().creates, 0); assert.equal(f.counts().puts, 1); assert.equal(f.events.includes('sign:1'), false);
});
test('pause/cancel before transfer sends no parts and never completes', async () => {
  const f = fixture(); f.interrupt(); await assert.rejects(transfer(f.entry, f.file, f.hooks), TransferInterrupted);
  assert.equal(f.counts().puts, 0); assert.equal(f.counts().completes, 0); assert.equal(f.entry.serverId, 'server');
});
test('interruption after signing prevents a new PUT', async () => {
  const f = fixture(); const api = f.hooks.api;
  f.hooks.api = async (path, body) => { const result = await api(path, body); if (path.endsWith('/part')) f.interrupt(); return result; };
  await assert.rejects(transfer(f.entry, f.file, f.hooks), TransferInterrupted); assert.equal(f.counts().puts, 0);
});
test('completion failure retains server identity and does not claim upload received', async () => {
  const f = fixture(); f.failComplete(); await assert.rejects(transfer(f.entry, f.file, f.hooks));
  assert.equal(f.entry.serverId, 'server'); assert.notEqual(f.entry.state, 'uploaded'); assert.notEqual(f.entry.percent, 100);
});
test('mismatched reselected file is rejected before any server action', async () => {
  const f = fixture(); await assert.rejects(transfer(f.entry, { ...f.file, lastModified: 999 }, f.hooks));
  assert.equal(f.counts().creates, 0); assert.equal(sameFile(f.entry, f.file), true);
});
test('restored queue retains each identity and changes in-flight uploads to paused', () => {
  const f = fixture(); f.entry.state = 'uploading'; f.entry.serverId = 'server';
  const restored = restoreQueue(JSON.stringify([f.entry, { ...f.entry, key: 'second', state: 'pending' }]));
  assert.equal(restored[0].state, 'paused'); assert.equal(restored[0].serverId, 'server'); assert.equal(restored[1].key, 'second');
});

test('completed and cancelled rows leave the active queue and enter bounded history', async () => {
  const { separateFinished } = await import('../src/upload-queue');
  const f = fixture();
  const done = { ...f.entry, key: 'done', state: 'uploaded' as const, serverId: 'old-server' };
  const cancelled = { ...f.entry, key: 'cancelled', state: 'cancelled' as const, serverId: 'cancelled-server' };
  const split = separateFinished([done, cancelled, f.entry], []);
  assert.deepEqual(split.active.map(row => row.key), ['local']);
  assert.equal(split.history.length, 2);
  assert.equal(split.active[0].serverId, undefined);
  assert.equal(split.history.some(row => row.serverId === 'cancelled-server'), true);
});
test('history is deduplicated and limited without retaining completed rows in the form', async () => {
  const { separateFinished } = await import('../src/upload-queue');
  const f = fixture();
  const rows = Array.from({ length: 60 }, (_, i) => ({ ...f.entry, key: String(i), state: 'uploaded' as const }));
  const first = separateFinished(rows, []);
  assert.equal(first.active.length, 0); assert.equal(first.history.length, 50);
  const second = separateFinished([rows[59]], first.history);
  assert.equal(second.history.length, 50); assert.equal(second.history.filter(row => row.key === '59').length, 1);
});
