import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { QUEUE_KEY, HISTORY_KEY, separateFinished, type UploadHistory, MAX_BYTES, restoreQueue, sameFile, transfer, TransferInterrupted, type UploadEntry } from './upload-queue';

function initialQueue(): UploadEntry[] {
  const saved = localStorage.getItem(QUEUE_KEY);
  if (saved) return restoreQueue(saved);
  const old = JSON.parse(localStorage.getItem('upload') || 'null');
  if (!old?.id || !old.filename || !old.size) return [];
  return [{ key: `legacy:${old.id}`, filename: old.filename, size: old.size, modified: old.modified || 0,
    title: old.title || old.filename, description: '', state: 'paused', serverId: old.id,
    confirmedBytes: old.confirmedBytes || 0, percent: 0, note: 'Select the original file to resume.' }];
}
const unfinished = (item: UploadEntry) => !['uploaded', 'cancelled'].includes(item.state);
export function BatchUploader({ videos, onBusy, onAuthError }: {
  videos: any[]; onBusy: (busy: boolean) => void; onAuthError: (error: unknown) => void;
}) {
  const [restoreError, setRestoreError] = useState('');
  const [view, setView] = useState<'upload' | 'history'>('upload');
  const [rows, setRows] = useState<UploadEntry[]>(() => {
    try { return initialQueue(); } catch { return []; }
  });
  const [history, setHistory] = useState<UploadHistory[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(row => row && typeof row.key === 'string' && typeof row.finishedAt === 'string').slice(0, 50) : [];
    } catch { return []; }
  });
  const historyRef = useRef(history);
  const entries = useRef(rows);
  const files = useRef(new Map<string, File>());
  const [running, setRunning] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [note, setNote] = useState('Choose videos to add, or reselect an unfinished original to resume.');
  const [cancelling, setCancelling] = useState<string[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const busy = useRef(false);
  const paused = useRef(false);
  const cancelled = useRef(new Set<string>());
  const active = useRef<string | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const completing = useRef(false);
  const mounted = useRef(true);

  function commit(next: UploadEntry[], persist = true) {
    const split = separateFinished(next, historyRef.current);
    const archived = next.length !== split.active.length;
    next = split.active;
    entries.current = next;
    if (archived) {
      historyRef.current = split.history;
      if (mounted.current) setHistory(split.history);
    }
    if (mounted.current) setRows(next);
    if (persist) {
      try {
        if (archived) localStorage.setItem(HISTORY_KEY, JSON.stringify(historyRef.current));
        localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); localStorage.removeItem('upload');
      }
      catch { if (mounted.current) setRestoreError('Browser storage is unavailable. Keep this tab open; this queue cannot be restored after refresh.'); }
    }
  }
  function update(key: string, patch: Partial<UploadEntry>) {
    commit(entries.current.map(item => item.key === key ? { ...item, ...patch } : item),
      'confirmedBytes' in patch || 'serverId' in patch || 'state' in patch || 'title' in patch || 'description' in patch);
  }
  useEffect(() => {
    mounted.current = true;
    try { initialQueue(); } catch { setRestoreError('The saved queue could not be read. Existing sessions remain in Sessions below.'); }
    commit(entries.current);
    // Recover a completion whose response was lost, without creating a new upload.
    void api('admin/videos').then(sessions => {
      if (!mounted.current) return;
      commit(entries.current.map(item => {
        if (!item.serverId || !unfinished(item)) return item;
        const video = sessions.find((video: any) => video.id === item.serverId);
        if (!video) return { ...item, state: 'cancelled', note: 'Previous upload is no longer available. Select the file to start fresh.' };
        if (video.status === 'DELETING') return { ...item, state: 'cancelled', note: 'Previous upload was cancelled; storage cleanup is finishing.' };
        if (video.status !== 'UPLOADING') return { ...item, state: 'uploaded', percent: 100, note: 'Upload already received. Check Sessions below.' };
        return item;
      }));
    }).catch(error => { if (mounted.current && error instanceof ApiError && error.status === 401) onAuthError(error); });
    return () => { mounted.current = false; paused.current = true; xhr.current?.abort(); };
  }, []);

  function choose(selected: FileList | null) {
    if (!selected) return;
    const next = [...entries.current];
    const rejected: string[] = [];
    for (const file of Array.from(selected)) {
      if (file.size <= 0 || file.size > MAX_BYTES || !/\.(mp4|mov|m4v|mkv|webm)$/i.test(file.name)) {
        rejected.push(file.name); continue;
      }
      const existing = next.find(item => unfinished(item) && sameFile(item, file));
      if (existing) { files.current.set(existing.key, file); existing.note = 'File matched. Click Start / Resume queue to continue from saved parts.'; continue; }
      const item: UploadEntry = { key: crypto.randomUUID(), filename: file.name, size: file.size,
        modified: file.lastModified, title: file.name.slice(0, 200), description: '', state: 'pending',
        confirmedBytes: 0, percent: 0, note: 'Waiting to upload.' };
      files.current.set(item.key, file); next.push(item);
    }
    commit(next); setSelectedCount(files.current.size);
    setNote(rejected.length ? `Not added: ${rejected.join(', ')}. Choose MP4, MOV, M4V, MKV or WebM files up to 20 GiB each.`
      : 'Files selected. Review titles, then start or resume the queue.');
  }

  function put(url: string, blob: Blob, progress: (loaded: number) => void) {
    return new Promise<string>((resolve, reject) => {
      const request = new XMLHttpRequest(); xhr.current = request;
      request.open('PUT', url);
      request.upload.onprogress = event => progress(event.loaded);
      request.onload = () => request.status >= 200 && request.status < 300
        ? resolve(request.getResponseHeader('ETag') || '') : reject(new Error(`Storage upload failed (HTTP ${request.status}). Resume to retry.`));
      request.onerror = () => reject(new Error('Network interrupted. Resume the queue to retry from saved parts.'));
      request.onabort = () => reject(new TransferInterrupted());
      request.onloadend = () => { if (xhr.current === request) xhr.current = null; };
      request.send(blob);
    });
  }

  async function cancelServer(item: UploadEntry) {
    if (item.serverId) {
      try { await api(`uploads/${item.serverId}/cancel`, {}); }
      catch (error) {
        const sessions = await api('admin/videos');
        const video = sessions.find((video: any) => video.id === item.serverId);
        if (video && video.status !== 'UPLOADING') {
          update(item.key, { state: video.status === 'DELETING' ? 'cancelled' : 'uploaded', percent: video.status === 'DELETING' ? 0 : 100, note: video.status === 'DELETING' ? 'Upload cancelled; storage cleanup is finishing.' : 'Upload already finished. Use Stop processing in Sessions.' });
          return;
        }
        if (video) throw error;
      }
    }
    update(item.key, { state: 'cancelled', percent: 0, note: 'Upload cancelled.' });
    files.current.delete(item.key);
    setNote('Upload cancelled and moved to history. Choose a file to start a fresh upload.');
  }
  async function cancel(key: string) {
    if (!window.confirm('Cancel this upload? Saved uploaded parts will be removed. Other queue items remain.')) return;
    if (active.current === key) {
      if (completing.current) return;
      cancelled.current.add(key); xhr.current?.abort(); return;
    }
    const item = entries.current.find(item => item.key === key);
    if (!item) return;
    cancelled.current.add(key);
    setCancelling(current => [...current, key]);
    try { await cancelServer(item); }
    catch (error) { update(key, { state: 'error', note: 'Cancellation did not finish. Try Cancel again.' }); if (error instanceof ApiError && error.status === 401) onAuthError(error); }
    finally { cancelled.current.delete(key); setCancelling(current => current.filter(item => item !== key)); }
  }

  async function runQueue() {
    paused.current = false;
    while (!paused.current && mounted.current) {
      const item = entries.current.find(item => unfinished(item) && !cancelled.current.has(item.key));
      if (!item) { setNote('The upload queue is clear. Recent uploads are in history; processing is shown in Sessions below.'); break; }
      const file = files.current.get(item.key);
      if (!file) { setNote(`Select the original file for “${item.title}” to continue. You can reselect multiple originals together.`); break; }
      if (!item.title.trim() || item.title.length > 200 || item.description.length > 5000) {
        update(item.key, { state: 'error', note: 'Enter a title (1–200 characters) and description of at most 5,000 characters.' }); break;
      }
      active.current = item.key; completing.current = false; setFinalizing(false);
      update(item.key, { state: 'uploading', note: 'Preparing upload…' });
      try {
        await transfer(item, file, { api, put,
          update: patch => update(item.key, patch),
          interrupted: () => paused.current || cancelled.current.has(item.key) || !mounted.current,
          finalizing: () => { completing.current = true; setFinalizing(true); },
        });
        files.current.delete(item.key);
      } catch (error) {
        if (cancelled.current.has(item.key)) {
          const current = entries.current.find(row => row.key === item.key)!;
          try { await cancelServer(current); }
          catch (error) { update(item.key, { state: 'error', note: 'Cancellation did not finish. Try Cancel again.' }); throw error; }
        } else if (error instanceof TransferInterrupted) {
          update(item.key, { state: 'paused', note: 'Paused. Completed parts are saved; Resume rechecks storage.' }); break;
        } else {
          // Completion can succeed even if its response is lost. Check before retrying.
          const current = entries.current.find(row => row.key === item.key)!;
          let received = false;
          if (current.serverId) {
            try {
              const sessions = await api('admin/videos');
              const video = sessions.find((video: any) => video.id === current.serverId);
              if (video && video.status !== 'UPLOADING') {
                update(item.key, { state: 'uploaded', percent: 100, note: 'Upload received. Check Sessions below.' }); received = true;
              }
            } catch { /* Retain identity and server-confirmed progress until retry. */ }
          }
          if (!received) {
            update(item.key, { state: 'error', note: error instanceof Error ? error.message : 'Upload failed. Resume to retry.' });
            if (error instanceof ApiError && error.status === 401) onAuthError(error);
            break;
          }
        }
      } finally {
        active.current = null; completing.current = false; cancelled.current.delete(item.key);
        if (mounted.current) setFinalizing(false);
      }
    }
  }
  async function start() {
    if (busy.current || cancelling.length) return;
    busy.current = true; setRunning(true); onBusy(true);
    try {
      if (navigator.locks) {
        await navigator.locks.request('ugn-upload-queue', { ifAvailable: true }, async lock => {
          if (!lock) { setNote('Another tab is uploading. Use that tab or pause its queue first.'); return; }
          await runQueue();
        });
      } else await runQueue();
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Upload queue interrupted.');
      if (error instanceof ApiError && error.status === 401) onAuthError(error);
    } finally {
      busy.current = false;
      if (mounted.current) { setRunning(false); setFinalizing(false); onBusy(false); }
    }
  }

  return <section>
    <h2>Upload sessions</h2>
    <div className="actions" aria-label="Upload views">
      <button type="button" className={view === 'upload' ? '' : 'secondary'} aria-pressed={view === 'upload'} onClick={() => setView('upload')}>Upload videos</button>
      <button type="button" className={view === 'history' ? '' : 'secondary'} aria-pressed={view === 'history'} onClick={() => setView('history')}>Upload history ({history.length})</button>
    </div>
    <div hidden={view !== 'upload'}>
    <p>Select several videos and upload them one at a time. Each completed upload enters the processing queue.</p>
    <label>Add videos or reselect originals to resume
      <input type="file" multiple accept="video/*,.mkv" disabled={running || cancelling.length > 0}
        onChange={event => { choose(event.target.files); event.target.value = ''; }} />
    </label>
    <p role="status">{note}</p>
    {restoreError && <p role="alert">{restoreError}</p>}
    {rows.map((item, index) => {
      const video = videos.find(video => video.id === item.serverId);
      const isActive = active.current === item.key;
      const canEdit = !item.serverId && unfinished(item) && !isActive;
      return <div key={item.key} className="batch-upload-row">
        <div className="progress-heading"><strong>{index + 1}. {item.filename}</strong><span>{item.state === 'uploaded' ? video?.status || 'Upload received' : item.state}</span></div>
        <p>{(item.size / 1024 ** 2).toFixed(1)} MiB</p>
        {unfinished(item) && !files.current.has(item.key) && <p role="status">
          <strong>Original file needed. Your progress is saved.</strong><br />
          Use Choose Files above to select <strong>{item.filename}</strong> again, then click Start / Resume queue.
        </p>}
        <label>Title<input value={item.title} maxLength={200} disabled={!canEdit} onChange={event => update(item.key, { title: event.target.value })} /></label>
        <label>Description (optional)<textarea value={item.description} maxLength={5000} disabled={!canEdit}
          onChange={event => update(item.key, { description: event.target.value })} /></label>
        {index === 0 && (
          <div className="actions">
      <button type="button" disabled={running || cancelling.length > 0 || !rows.some(unfinished) || !selectedCount}
        onClick={() => void start()}>Start / Resume queue</button>
      <button type="button" className="secondary" disabled={!running || finalizing} onClick={() => {
        paused.current = true; xhr.current?.abort(); setNote('Pausing the queue. Completed parts remain saved.');
      }}>Pause queue</button>

    </div>
        )}
        <div className="progress-heading"><span>Upload progress</span><strong>{item.percent}%</strong></div>
        <progress max={100} value={item.percent} aria-label={`Upload ${item.title}`} />
        <p role={item.state === 'error' ? 'alert' : 'status'}>{item.note}</p>
        {unfinished(item) && <button type="button" className="secondary"
          disabled={cancelling.includes(item.key) || (isActive && finalizing)} onClick={() => void cancel(item.key)}>
          {cancelling.includes(item.key) ? 'Cancelling…' : item.serverId ? 'Cancel upload' : 'Remove from queue'}
        </button>}
      </div>;
    })}
    </div>
    <div hidden={view !== 'history'} style={{ marginTop: 24 }}>
      <h3>Upload history</h3>
      <p>Recent uploads and cancellations on this browser. Finished items clear from the upload form automatically. Sessions below contain playback and processing controls.</p>
      {history.length === 0 && <p>No upload history yet.</p>}
      {history.map(item => <div key={item.key} className="batch-upload-row">
        <div className="progress-heading"><strong>{item.title}</strong><span>{item.state === 'cancelled' ? 'Cancelled' : 'Upload received'}</span></div>
        <p>{item.filename} · {(item.size / 1024 ** 2).toFixed(1)} MiB</p>
        {item.description && <p>{item.description}</p>}
        <p>{new Date(item.finishedAt).toLocaleString()}{videos.find(video => video.id === item.serverId)?.status ? ` · Session: ${videos.find(video => video.id === item.serverId).status}` : ''}</p>
      </div>)}
      {history.length > 0 && <button type="button" className="secondary" onClick={() => {
        if (!window.confirm('Clear upload history on this browser? Stored videos and unfinished uploads are kept.')) return;
        try { localStorage.removeItem(HISTORY_KEY); historyRef.current = []; setHistory([]); }
        catch { setRestoreError('Could not clear browser history.'); }
      }}>Clear upload history</button>}
    </div>
  </section>;
}
