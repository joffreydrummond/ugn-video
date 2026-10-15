import { spawn } from 'node:child_process';
// Short commands return bounded output. Encoding streams progress instead.
export function runMedia(bin: string, args: string[], onSeconds?: (seconds: number) => void, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, { signal, killSignal: 'SIGKILL' });
    let output = '', errors = '', pending = '';
    child.stdout.on('data', (data) => {
      const text = data.toString();
      if (!onSeconds) { output = (output + text).slice(-1_000_000); return; }
      pending += text;
      let newline: number;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line.startsWith('out_time_us=')) {
          const seconds = Number(line.slice(12)) / 1_000_000;
          if (Number.isFinite(seconds) && seconds >= 0) onSeconds(seconds);
        }
      }
    });
    child.stderr.on('data', data => { errors = (errors + data.toString()).slice(-8000); });
    let spawnError: Error | undefined;
    child.on('error', error => { spawnError = error; });
    child.on('close', code => {
      if (spawnError) reject(spawnError);
      else if (code === 0) resolve(output);
      else reject(new Error(errors || `${bin} exited with code ${code}`));
    });
  });
}

