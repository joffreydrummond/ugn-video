import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMedia } from '../src/process';
test('media subprocess is dead before an aborted run settles', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'ugn-process-test-'));
  const pidFile = join(folder, 'pid');
  const controller = new AbortController();
  try {
    const script = `require('node:fs').writeFileSync(process.argv[1], String(process.pid)); console.log('out_time_us=1000000'); setInterval(()=>{}, 1000);`;
    await assert.rejects(runMedia(process.execPath, ['-e', script, pidFile], () => controller.abort(), controller.signal));
    const pid = Number(await readFile(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), (error: any) => error.code === 'ESRCH');
  } finally { await rm(folder, { recursive: true, force: true }); }
});
