import { presetLabel, spokenDuration } from './session-presentation';
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/bebas-neue/latin-400.css';
import { MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { api, ApiError } from './api';
import { BatchUploader } from './BatchUploader';
import { Player } from './Player';
import { PublicPage } from './PublicPage';
import { routeFromHash } from './playback-model';

function readableProcessingError(error: unknown) {
  const detail = String(error || '');
  if (/invalid data found|moov atom not found|no video stream|invalid media duration|invalid media container|no readable body/i.test(detail)) {
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
    case 'STOPPING': return name + ' is stopping. Waiting for the worker and partial-file cleanup.';
    case 'STOPPED': return name + ' is stopped. The original is saved for restart or deletion.';
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
        <img crossOrigin="anonymous" src={poster} alt="" loading="lazy" decoding="async"
          className={loaded ? 'preview-loaded' : ''}
          onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      )}
      {(!loaded || failed) && <span className="preview-placeholder">
        {!ready ? 'Preview available when ready' : failed ? 'Preview unavailable' : 'Loading preview…'}
      </span>}
    </div>
  );
}

function AdminApp() {
  const [auth, setAuth] = useState<
    'checking' | 'signed-out' | 'signed-in'
  >('checking');

  const [email, setEmail] = useState('admin@ugn.local');
  const [password, setPassword] = useState('');
  const [videos, setVideos] = useState<any[]>([]);
  const [message, setMessageText] = useState('');
  const [noticeVideo, setNoticeVideo] = useState<{ id: string; title: string; status: string } | null>(null);
  function setMessage(value: string) {
    setNoticeVideo(null);
    setMessageText(value);
  }
  const displayedMessage = noticeVideo
    ? processingNotice(videos.find(video => video.id === noticeVideo.id) || noticeVideo)
    : message;
  const [selected, setSelected] = useState('');
  const playerContainer = useRef<HTMLDivElement>(null);
  function scrollToPlayer() {
    const container = playerContainer.current;
    if (!container) return;
    container.focus({ preventScroll: true });
    container.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }
  function watchSession(id: string) {
    if (selected === id) scrollToPlayer();
    else setSelected(id);
  }
  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(scrollToPlayer);
    return () => cancelAnimationFrame(frame);
  }, [selected]);
  const [uploading, setUploading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [sessionAction, setSessionAction] = useState<{ id: string; kind: 'retry' | 'delete' | 'stop' } | null>(null);
  const actionBusy = useRef(false);

  function clearSession() {
    setAuth('signed-out');
    setUploading(false);
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

  async function manageSession(video: any, kind: 'retry' | 'delete' | 'stop') {
    if (actionBusy.current) return;
    if (kind === 'delete' && !window.confirm(
      `Delete “${video.title}”? This permanently removes the original video, playback files, and session record.`,
    )) return;
    if (kind === 'stop' && !window.confirm(`Stop processing “${video.title}”? The original stays saved. Restart begins encoding again from the beginning.`)) return;
    actionBusy.current = true;
    setSessionAction({ id: video.id, kind });
    setMessage(kind === 'delete' ? 'Deleting session and stored files…' : kind === 'stop' ? 'Requesting processing stop…' : 'Queuing processing…');
    if (kind === 'delete' && selected === video.id) setSelected('');
    try {
      const response = await api(`admin/videos/${video.id}/${kind}`, {});
      if (kind === 'delete') {
        setVideos(previous => previous.filter(item => item.id !== video.id));
        try { localStorage.removeItem(`watch:${video.id}`); } catch { /* Optional per-device playback history. */ }
        setMessage(`“${video.title}” deleted.`);
      } else if (kind === 'stop') {
        setVideos(previous => previous.map(item => item.id === video.id ? { ...item, status: response.status || 'STOPPING', estimatedCompletionAt: null } : item));
        setMessage('');
        setNoticeVideo({ id: video.id, title: video.title, status: response.status || 'STOPPING' });
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
        <a className="studio-public-link" href="#/watch" target="_blank" rel="noopener noreferrer">Public viewing page ↗</a>
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
          <BatchUploader videos={videos} onBusy={setUploading} onAuthError={handleError} />

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

                  <div className="session-details admin-session-metadata" tabIndex={0} role="group"
                    aria-label={`${video.title}. Status: ${video.status.toLowerCase()}.${video.status === 'READY' ? ' Ready to watch.' : ''} ${spokenDuration(video.duration)}. Processing quality: ${presetLabel(video.encodingPreset)}.${uploadDate(video.createdAt) ? ` Uploaded ${new Date(video.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.` : ''}`}>
                    <span>{spokenDuration(video.duration)}</span>
                    {uploadDate(video.createdAt) && (
                      <span>Uploaded <time dateTime={new Date(video.createdAt).toISOString()} title={new Date(video.createdAt).toLocaleString()}>
                        {new Date(video.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </time></span>
                    )}
                    <span className="preset-badge">{presetLabel(video.encodingPreset)}</span>
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
                  {video.status === 'STOPPING' && <p role="status">Stopping processing and cleaning partial files… Restart and Delete will be available when cleanup finishes.</p>}
                  {video.status === 'STOPPED' && <p>Processing stopped. The original is saved. Restart begins encoding from the beginning.</p>}
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
                    </>
                  )}
                  {['UPLOADED', 'PROCESSING', 'RETRYING'].includes(video.status) && (
                    <button type="button" className="secondary" disabled={!!sessionAction} onClick={() => void manageSession(video, 'stop')}>
                      {sessionAction?.id === video.id && sessionAction?.kind === 'stop' ? 'Stopping…' : 'Stop processing'}
                    </button>
                  )}
                  {['READY', 'FAILED', 'STOPPED', 'DELETING'].includes(video.status) && (
                    <div className="actions" style={{ marginTop: 16 }}>
                      {video.status === 'READY' && (
                        <button type="button" onClick={() => watchSession(video.id)}>Watch session</button>
                      )}
                      {['FAILED', 'STOPPED'].includes(video.status) && (
                        <button type="button" disabled={!!sessionAction} onClick={() => void manageSession(video, 'retry')}>
                          {sessionAction?.id === video.id && sessionAction?.kind === 'retry' ? 'Queuing…' : video.status === 'STOPPED' ? 'Restart processing' : 'Retry processing'}
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

          {selected && (
            <div ref={playerContainer} tabIndex={-1} role="region" aria-label="Session player" style={{ scrollMarginTop: 24 }}>
              <Player key={selected} id={selected} onClose={() => setSelected('')} />
            </div>
          )}
        </>
      )}
    </main>
  );
}

function App() {
  const reducedMotion = useReducedMotion();
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const changed = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  return <MotionConfig reducedMotion="user"><Toaster position="top-right" toastOptions={{ style: { background: '#1b1b22', color: '#f4f4f5', border: '1px solid #555563' } }} /><motion.div key={route.page} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="min-h-screen bg-canvas font-sans text-zinc-100">{route.page === 'admin' ? <AdminApp /> : <PublicPage selected={route.id} />}</motion.div></MotionConfig>;
}
createRoot(document.getElementById('root')!).render(<App />);