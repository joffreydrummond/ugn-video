import { PART_SIZE, MAX_BYTES } from '../../../packages/contracts/src/index';
export { PART_SIZE, MAX_BYTES };
export type UploadState = 'pending' | 'uploading' | 'paused' | 'error' | 'uploaded' | 'cancelled';
export type UploadEntry = {
  key: string; filename: string; size: number; modified: number; title: string; description: string;
  state: UploadState; serverId?: string; confirmedBytes: number; percent: number; note: string;
};
export const QUEUE_KEY = 'ugn:upload-queue:v1';
export function sameFile(entry: UploadEntry, file: Pick<File, 'name' | 'size' | 'lastModified'>) {
  return entry.filename === file.name && entry.size === file.size && entry.modified === file.lastModified;
}
export function restoreQueue(text: string | null): UploadEntry[] {
  const parsed = JSON.parse(text || '[]');
  if (!Array.isArray(parsed)) throw new Error('Saved upload queue is invalid.');
  return parsed.filter(row => row && typeof row.key === 'string' && typeof row.filename === 'string'
    && Number.isFinite(row.size) && row.size > 0 && Number.isFinite(row.modified)
    && ['pending', 'uploading', 'paused', 'error', 'uploaded', 'cancelled'].includes(row.state))
    .map(row => ({ ...row, state: row.state === 'uploading' ? 'paused' : row.state,
      note: ['uploaded', 'cancelled'].includes(row.state) ? row.note : 'Select the original file to resume.' }));
}
export class TransferInterrupted extends Error {}
type Hooks = {
  api: (path: string, body?: unknown) => Promise<any>;
  put: (url: string, blob: Blob, progress: (loaded: number) => void) => Promise<string>;
  update: (patch: Partial<UploadEntry>) => void;
  interrupted: () => boolean;
  finalizing: () => void;
};
// Read confirmed parts from storage on EVERY attempt; browser byte counters are display only.
export async function transfer(entry: UploadEntry, file: File, hooks: Hooks) {
  if (!sameFile(entry, file)) throw new Error('Select the identical original file to resume.');
  let id = entry.serverId;
  if (!id) {
    const video = await hooks.api('uploads', { title: entry.title.trim() || file.name, description: entry.description,
      filename: file.name, size: file.size });
    id = video.id;
    hooks.update({ serverId: id }); // persist before the first part request
  }
  const existing = await hooks.api(`uploads/${id}/parts`);
  const parts: { PartNumber: number; ETag: string }[] = existing.map((part: any) => ({ PartNumber: part.PartNumber, ETag: part.ETag }));
  let sent = existing.reduce((sum: number, part: any) => sum + Number(part.Size || 0), 0);
  let transferred = 0;
  const started = Date.now();
  hooks.update({ confirmedBytes: sent, percent: Math.min(99, Math.floor(sent / file.size * 100)) });
  for (let number = 1; number <= Math.ceil(file.size / PART_SIZE); number++) {
    if (hooks.interrupted()) throw new TransferInterrupted();
    if (parts.some(part => part.PartNumber === number)) continue;
    const blob = file.slice((number - 1) * PART_SIZE, number * PART_SIZE);
    const { url } = await hooks.api(`uploads/${id}/part`, { part: number });
    if (hooks.interrupted()) throw new TransferInterrupted();
    const etag = await hooks.put(url, blob, loaded => {
      const speed = (transferred + loaded) / Math.max(0.1, (Date.now() - started) / 1000);
      const seconds = Math.ceil(Math.max(0, file.size - sent - loaded) / Math.max(1, speed));
      hooks.update({ percent: Math.min(99, Math.floor((sent + loaded) / file.size * 100)),
        note: `${(speed / 1024 ** 2).toFixed(1)} MB/s · About ${seconds} seconds remaining` });
    });
    if (!etag) throw new Error('Storage did not return an ETag. Check storage CORS.');
    parts.push({ PartNumber: number, ETag: etag });
    sent += blob.size; transferred += blob.size;
    hooks.update({ confirmedBytes: sent, percent: Math.min(99, Math.floor(sent / file.size * 100)) });
  }
  if (hooks.interrupted()) throw new TransferInterrupted();
  hooks.finalizing();
  hooks.update({ note: 'Finalizing upload…' });
  await hooks.api(`uploads/${id}/complete`, { parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) });
  hooks.update({ state: 'uploaded', percent: 100, note: 'Upload received. Follow processing in Sessions below.' });
  return id!;
}

export const HISTORY_KEY = 'ugn:upload-history:v1';
export type UploadHistory = UploadEntry & { finishedAt: string };
export function separateFinished(rows: UploadEntry[], history: UploadHistory[], now = new Date().toISOString()) {
  const finished = rows.filter(row => ['uploaded', 'cancelled'].includes(row.state));
  const added = finished.map(row => ({ ...row, finishedAt: now }));
  const keys = new Set(added.map(row => row.key));
  return {
    active: rows.filter(row => !['uploaded', 'cancelled'].includes(row.state)),
    history: [...added.reverse(), ...history.filter(row => !keys.has(row.key))].slice(0, 50),
  };
}
