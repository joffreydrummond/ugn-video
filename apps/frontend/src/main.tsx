import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Hls from 'hls.js';
import './style.css';

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function api(path: string, body?: unknown) {
  const response = await fetch(`http://localhost:3000/${path}`, {
    credentials: 'include',
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      typeof data.message === 'string'
        ? data.message
        : JSON.stringify(data.message || 'Request failed'),
      response.status,
    );
  }

  return data;
}

function readableProcessingError(error: unknown) {
  const detail = String(error || '');
  if (/invalid data found|moov atom not found|no video stream|invalid media duration|no readable body/i.test(detail)) {
    return 'This file could not be read as a video. Try uploading a valid video file.';
  }
  return 'Processing could not finish. Try processing again. If it keeps failing, try uploading a different video file.';
}

function processingNotice(video: any) {
  const name = '“' + video.title + '”';
  switch (video.status) {
    case 'READY': return name + ' is ready to watch.';
    case 'FAILED': return name + ': ' + readableProcessingError(video.error);
    case 'RETRYING': return name + ' will retry automatically. Your original upload is saved.';
    case 'PROCESSING': return name + ' is processing. Follow its progress in Sessions below.';
    case 'DELETING': return name + ' is being deleted.';
    default: return name + ': Upload received. Queued for processing.';
  }
}

function processingEstimate(video: any) {
  if (!video.processingHeartbeatAt) return 'Calculating time remaining…';
  const age = Date.now() - new Date(video.processingHeartbeatAt).getTime();
  if (age > 30000) return 'Waiting for a fresh processing update…';
  if (!video.estimatedCompletionAt) return 'Calculating time remaining…';
  const remaining = (new Date(video.estimatedCompletionAt).getTime() - Date.now()) / 1000;
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Updating completion estimate…';
  const minutes = Math.ceil(remaining / 60);
  const time = new Date(video.estimatedCompletionAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const length = minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
  return `About ${length} remaining · Estimated finish ${time}`;
}

function processingStage(progress: number) {
  if (progress < 5) return 'Preparing video';
  if (progress < 35) return 'Encoding 1080p';
  if (progress < 65) return 'Encoding 720p';
  if (progress < 95) return 'Encoding 480p';
  return 'Creating thumbnail and publishing';
}

function Player({ id, onClose }: { id: string; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let hls: Hls | undefined;
    let disposed = false;
    const element = ref.current;

    api(`videos/${id}/playback`)
      .then((video) => {
        if (disposed || !ref.current) return;

        setInfo(video);
        const element = ref.current;

        if (!video.manifestUrl) {
          setError('This video is not ready for playback.');
        } else if (element.canPlayType('application/vnd.apple.mpegurl')) {
          element.src = video.manifestUrl;
        } else if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(video.manifestUrl);
          hls.attachMedia(element);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) setError(`Playback error: ${data.details}`);
          });
        } else {
          setError('This browser does not support HLS playback.');
        }
      })
      .catch((error) => {
        if (!disposed) setError(String(error));
      });

    return () => {
      disposed = true;
      element?.pause();
      hls?.destroy();
      if (element) {
        element.removeAttribute('src');
        element.load();
      }
    };
  }, [id]);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{info?.title || 'Video player'}</h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close player
        </button>
      </div>
      <video
        ref={ref}
        controls
        playsInline
        poster={info?.poster}
        onLoadedMetadata={() => {
          const element = ref.current;
          if (!element) return;

          const saved = Number(localStorage.getItem(`watch:${id}`) || 0);

          if (
            Number.isFinite(saved) &&
            saved > 0 &&
            saved < element.duration - 2
          ) {
            element.currentTime = saved;
          }
        }}
        onTimeUpdate={() => {
          localStorage.setItem(
            `watch:${id}`,
            String(ref.current?.currentTime || 0),
          );
        }}
      />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function formatDuration(value: unknown) {
  const seconds = Number(value);
  if (value == null || !Number.isFinite(seconds) || seconds <= 0) return 'Duration pending';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const remainder = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}

function uploadDate(value: unknown) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

// One metadata request when a ready card mounts, rather than on each list poll.
function SessionPreview({ id, ready }: { id: string; ready: boolean }) {
  const [poster, setPoster] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    setPoster('');
    setLoaded(false);
    setFailed(false);
    if (!ready) return;
    api(`videos/${id}/playback`).then(info => {
      if (disposed) return;
      if (info.poster) setPoster(info.poster);
      else setFailed(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; };
  }, [id, ready]);

  return (
    <div className="session-preview">
      {poster && !failed && (
        <img src={poster} alt="" loading="lazy" decoding="async"
          className={loaded ? 'preview-loaded' : ''}
          onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      )}
      {(!loaded || failed) && <span className="preview-placeholder">
        {!ready ? 'Preview available when ready' : failed ? 'Preview unavailable' : 'Loading preview…'}
      </span>}
    </div>
  );
}

function App() {
  const [auth, setAuth] = useState<
    'checking' | 'signed-out' | 'signed-in'
  >('checking');

  const [email, setEmail] = useState('admin@ugn.local');
  const [password, setPassword] = useState('');
  const [videos, setVideos] = useState<any[]>([]);
  const [file, setFile] = useState<File>();
  const [title, setTitle] = useState('');
  const [message, setMessageText] = useState('');
  const [noticeVideo, setNoticeVideo] = useState<{ id: string; title: string; status: string } | null>(null);
  function setMessage(value: string) {
    setNoticeVideo(null);
    setMessageText(value);
  }
  const displayedMessage = noticeVideo
    ? processingNotice(videos.find(video => video.id === noticeVideo.id) || noticeVideo)
    : message;
  const [percent, setPercent] = useState(0);
  const [selected, setSelected] = useState('');
  const [uploading, setUploading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [savedUpload, setSavedUpload] = useState<any>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [sessionAction, setSessionAction] = useState<{ id: string; kind: 'retry' | 'delete' } | null>(null);
  const actionBusy = useRef(false);

  function readSavedUpload() {
    try {
      return JSON.parse(localStorage.getItem('upload') || 'null');
    } catch {
      return null;
    }
  }


  const paused = useRef(false);
  const busy = useRef(false);
  const current = useRef<any>(null);

  function clearSession() {
    setAuth('signed-out');
    setVideos([]);
    setSelected('');
    setPassword('');
  }

  function handleError(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      clearSession();
      setMessage('Your session expired. Sign in again to continue.');
    } else {
      setMessage(String(error));
    }
  }

  // On refresh, ask the backend whether the existing cookie is valid.
  useEffect(() => {
    let disposed = false;

    api('auth/me')
      .then(() => {
        if (!disposed) setAuth('signed-in');
      })
      .catch((error) => {
        if (disposed) return;
        setAuth('signed-out');

        if (!(error instanceof ApiError && error.status === 401)) {
          setMessage('Unable to check your session. Please sign in.');
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  // Restore display metadata, but read confirmed bytes from storage.
  useEffect(() => {
    if (auth !== 'signed-in') return;
    let disposed = false;
    const saved = readSavedUpload();
    if (!saved) return;

    current.current = saved;
    setSavedUpload(saved);
    setTitle(saved.title || '');
    setPercent(Math.min(99, Math.floor(((saved.confirmedBytes || 0) / saved.size) * 100)));
    setMessage('Unfinished upload found. Select the original file to resume.');

    api(`uploads/${saved.id}/parts`).then((parts) => {
      if (disposed) return;
      const confirmedBytes = parts.reduce((sum: number, part: any) => sum + Number(part.Size || 0), 0);
      const restored = { ...saved, confirmedBytes };
      localStorage.setItem('upload', JSON.stringify(restored));
      current.current = restored;
      setSavedUpload(restored);
      setPercent(Math.min(99, Math.floor(confirmedBytes / saved.size * 100)));
    }).catch((error) => {
      if (!disposed) setMessage(`Could not verify saved upload: ${String(error)}`);
    });

    return () => { disposed = true; };
  }, [auth]);

  // Only fetch the admin session list after authentication.
  useEffect(() => {
    if (auth !== 'signed-in') return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const result = await api('admin/videos');
        if (!disposed) setVideos(result);
      } catch (error) {
        if (disposed) return;
        handleError(error);

        if (error instanceof ApiError && error.status === 401) return;
      }

      if (!disposed) timer = setTimeout(poll, 3000);
    }

    void poll();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [auth]);

  function resetUploadForm() {
    setFile(undefined);
    setTitle('');
    setPercent(0);
    setSavedUpload(null);
    current.current = null;
    paused.current = false;
    if (fileInput.current) fileInput.current.value = '';
  }

  async function upload() {
    if (!file || busy.current) return;

    busy.current = true;
    paused.current = false;
    setUploading(true);
    setMessage('Preparing upload…');

    try {
      const saved = readSavedUpload();
      if (saved && (saved.filename !== file.name || saved.size !== file.size || saved.modified !== file.lastModified)) {
        throw new Error('Select the original file for this upload, or cancel the saved upload before starting a different one.');
      }

      let video =
        saved &&
        saved.filename === file.name &&
        saved.size === file.size &&
        saved.modified === file.lastModified
          ? saved
          : await api('uploads', {
              title: title || file.name,
              filename: file.name,
              size: file.size,
            });

      video = { ...video, modified: file.lastModified };
      current.current = video;
      setSavedUpload(video);
      localStorage.setItem('upload', JSON.stringify(video));

      const existing = await api(`uploads/${video.id}/parts`);

      const parts: { PartNumber: number; ETag: string }[] =
        existing.map((part: any) => ({
          PartNumber: part.PartNumber,
          ETag: part.ETag,
        }));

      const partSize = 64 * 1024 * 1024;
      let sent = existing.reduce(
        (total: number, part: any) => total + part.Size,
        0,
      );

      setPercent(Math.min(99, Math.floor((sent / file.size) * 100)));

      const started = Date.now();
      let transferred = 0;

      for (
        let partNumber = 1;
        partNumber <= Math.ceil(file.size / partSize);
        partNumber++
      ) {
        if (parts.some((part) => part.PartNumber === partNumber)) continue;

        if (paused.current) {
          setMessage('Paused. Click Upload / Resume to continue.');
          return;
        }

        const blob = file.slice(
          (partNumber - 1) * partSize,
          partNumber * partSize,
        );

        const { url } = await api(`uploads/${video.id}/part`, {
          part: partNumber,
        });

        const etag = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', url);

          xhr.upload.onprogress = (event) => {
            setPercent(Math.min(
              99,
              Math.floor(((sent + event.loaded) / file.size) * 100),
            ));

            const seconds = Math.max((Date.now() - started) / 1000, 0.1);
            const speed = (transferred + event.loaded) / seconds;
            const remaining = Math.max(
              0,
              file.size - sent - event.loaded,
            );

            setMessage(
              `${(speed / 1024 ** 2).toFixed(1)} MB/s · ` +
              `ETA ${Math.ceil(remaining / Math.max(1, speed))} seconds`,
            );
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(xhr.getResponseHeader('ETag') || '');
            } else {
              reject(new Error(
                `Storage HTTP ${xhr.status}: ` +
                xhr.responseText.slice(0, 700),
              ));
            }
          };

          xhr.onerror = () => {
            reject(new Error(
              'Network interrupted. Click Upload / Resume to continue.',
            ));
          };

          xhr.send(blob);
        });

        if (!etag) throw new Error('Storage CORS must expose ETag.');

        parts.push({ PartNumber: partNumber, ETag: etag });
        sent += blob.size;
        transferred += blob.size;
        video = { ...video, confirmedBytes: sent };
        localStorage.setItem('upload', JSON.stringify(video));
        current.current = video;
        setSavedUpload(video);
      }

      setMessage('Finalizing upload…');
      await api(`uploads/${video.id}/complete`, { parts });

      localStorage.removeItem('upload');
      resetUploadForm();
      setMessage('');
      setNoticeVideo({ id: video.id, title: video.title || file.name, status: 'UPLOADED' });
    } catch (error) {
      handleError(error);
    } finally {
      busy.current = false;
      setUploading(false);
    }
  }

  async function cancelUpload() {
    if (busy.current) {
      paused.current = true;
      setMessage(
        'Pausing after the current part. Click Cancel again once paused.',
      );
      return;
    }

    const video =
      current.current ||
      readSavedUpload();

    if (!video) {
      resetUploadForm();
      setMessage('Upload form cleared.');
      return;
    }

    try {
      await api(`uploads/${video.id}/cancel`, {});
      localStorage.removeItem('upload');
      resetUploadForm();
      setMessage('Upload cancelled.');
    } catch (error) {
      handleError(error);
    }
  }

  async function manageSession(video: any, kind: 'retry' | 'delete') {
    if (actionBusy.current) return;
    if (kind === 'delete' && !window.confirm(
      `Delete “${video.title}”? This permanently removes the original video, playback files, and session record.`,
    )) return;
    actionBusy.current = true;
    setSessionAction({ id: video.id, kind });
    setMessage(kind === 'delete' ? 'Deleting session and stored files…' : 'Queuing processing…');
    if (kind === 'delete' && selected === video.id) setSelected('');
    try {
      await api(`admin/videos/${video.id}/${kind}`, {});
      if (kind === 'delete') {
        setVideos(previous => previous.filter(item => item.id !== video.id));
        try { localStorage.removeItem(`watch:${video.id}`); } catch { /* Optional per-device playback history. */ }
        setMessage(`“${video.title}” deleted.`);
      } else {
        setVideos(previous => previous.map(item => item.id === video.id
          ? { ...item, status: 'UPLOADED', progress: 0, error: null, estimatedCompletionAt: null, processingStage: null }
          : item));
        setMessage('');
        setNoticeVideo({ id: video.id, title: video.title, status: 'UPLOADED' });
      }
      try { setVideos(await api('admin/videos')); } catch (error) { handleError(error); }
    } catch (error) {
      handleError(error);
    } finally {
      actionBusy.current = false;
      setSessionAction(null);
    }
  }

  async function logout() {
    try {
      await api('auth/logout', {});
      clearSession();
      setPercent(0);
      setMessage('');
    } catch (error) {
      handleError(error);
    }
  }

  return (
    <main>
      <header>
        <b>UNDERGROUND NIGHTS</b>
        <span>VIDEO STUDIO</span>
        {auth === 'signed-in' && (
          <button
            className="secondary"
            disabled={uploading}
            onClick={() => void logout()}
          >
            Sign out
          </button>
        )}
      </header>

      <h1>Long sets. Simple playback.</h1>
      <p>Upload, process, and publish your sessions.</p>

      {auth === 'checking' && (
        <section role="status">Checking your session…</section>
      )}

      {auth === 'signed-out' && (
        <form onSubmit={async (event) => {
          event.preventDefault();
          setSigningIn(true);
          setMessage('');

          try {
            await api('auth/login', { email, password });
            setPassword('');
            setAuth('signed-in');
          } catch (error) {
            setMessage(String(error));
          } finally {
            setSigningIn(false);
          }
        }}>
          <h2>Admin sign in</h2>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" disabled={signingIn}>
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      {displayedMessage && <p role="status">{displayedMessage}</p>}

      {auth === 'signed-in' && (
        <>
          <section>
            <h2>{savedUpload ? 'Continue your upload' : 'Publish a session'}</h2>
          {savedUpload && (
            <div role="status" style={{ border: '1px solid #555563', padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <strong>{savedUpload.title || savedUpload.filename}</strong>
              <p style={{ marginBottom: 8 }}>{savedUpload.filename} · {(savedUpload.size / 1024 ** 2).toFixed(1)} MiB</p>
              <p style={{ marginTop: 0 }}>Completed parts are saved. Select the original file to continue from saved progress.</p>
              {!file && <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>Select original file to resume</button>}
            </div>
          )}
            <label>
              Title
              <input
                value={title}
                disabled={!!savedUpload || uploading}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              Video file
              <input
                type="file"
                ref={fileInput}
              accept="video/*"
                disabled={uploading}
                onChange={(event) => setFile(event.target.files?.[0])}
              />
            </label>

            <div className="actions">
              <button
                disabled={!file || uploading}
                onClick={() => void upload()}
              >
                Upload / Resume
              </button>
              <button
                className="secondary"
                disabled={!uploading}
                onClick={() => {
                  paused.current = true;
                  setMessage('Will pause after the current 64 MiB part.');
                }}
              >
                Pause
              </button>
              <button
                className="secondary"
                disabled={!file && !savedUpload && !uploading}
                onClick={() => void cancelUpload()}
              >
                Cancel
              </button>
            </div>

            <div className="progress-heading">
              <span>Upload progress</span>
              <strong>{percent}%</strong>
            </div>
            <progress
              className="upload-progress"
              max={100}
              value={percent}
              aria-label="Upload progress"
            />
          </section>

          <h2>Sessions</h2>
          {videos.length === 0 && <p>No sessions yet.</p>}

          <div className="grid">
            {videos.map((video) => {
              const progress = Math.min(
                100,
                Math.max(0, Number(video.progress) || 0),
              );

              return (
                <article key={video.id} className="session-card">
                  <SessionPreview id={video.id} ready={video.status === 'READY'} />
                  <div className="session-heading">
                    <h3>{video.title}</h3>
                    <span className={
                      `status-badge ${video.status.toLowerCase()}`
                    }>
                      {video.status}
                    </span>
                  </div>

                  <div className="session-details">
                    <span>{formatDuration(video.duration)}</span>
                    {uploadDate(video.createdAt) && (
                      <span>Uploaded <time dateTime={new Date(video.createdAt).toISOString()} title={new Date(video.createdAt).toLocaleString()}>
                        {new Date(video.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </time></span>
                    )}
                  </div>

                  {video.status === 'PROCESSING' && (
                    <div className="processing-panel">
                      <div className="progress-heading">
                        <span>{video.processingStage || processingStage(progress)}</span>
                        <strong>{progress}%</strong>
                      </div>
                      <progress
                        className="processing-progress"
                        max={100}
                        value={progress}
                        aria-label={`Processing ${video.title}`}
                      />
                      <p className="progress-note">
                        {processingEstimate(video)}
                      </p>
                    </div>
                  )}

                  {video.status === 'UPLOADED' && (
                    <p>Queued for processing. Waiting for an available worker…</p>
                  )}
                  {video.status === 'RETRYING' && <p>Processing will retry automatically. Your original upload is saved.</p>}
                  {video.status === 'DELETING' && <p>Deletion is unfinished. Try deleting again to complete cleanup.</p>}
                  {video.status === 'UPLOADING' && (
                    <p>Waiting for the upload to finish.</p>
                  )}
                  {video.error && video.status === 'FAILED' && (
                    <p className="error-message" role="alert">
                      {readableProcessingError(video.error)}
                    </p>
                  )}
                  {video.status === 'READY' && (
                    <>
                      <p className="ready-message">Ready to watch.</p>
                      <button onClick={() => setSelected(video.id)}>
                        Watch session
                      </button>
                    </>
                  )}
                  {['READY', 'FAILED', 'DELETING'].includes(video.status) && (
                    <div className="actions" style={{ marginTop: 16 }}>
                      {video.status === 'FAILED' && (
                        <button type="button" disabled={!!sessionAction} onClick={() => void manageSession(video, 'retry')}>
                          {sessionAction?.id === video.id && sessionAction?.kind === 'retry' ? 'Queuing…' : 'Retry processing'}
                        </button>
                      )}
                      <button type="button" className="secondary" disabled={!!sessionAction}
                        onClick={() => void manageSession(video, 'delete')}>
                        {sessionAction?.id === video.id && sessionAction?.kind === 'delete'
                          ? 'Deleting…' : video.status === 'DELETING' ? 'Try delete again' : 'Delete session'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {selected && <Player key={selected} id={selected} onClose={() => setSelected('')} />}
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);