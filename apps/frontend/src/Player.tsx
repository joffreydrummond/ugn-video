import { spokenDuration } from './session-presentation';
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { publicApi } from './api';
import { levelHeight, playbackEngine, renditionSources, resumePosition, stateMessage, watchHash } from './playback-model';
import type { PlaybackInfo } from '../../../packages/contracts/src/index';

type Choice = { value: string; label: string; url?: string };
export function Player({ id, onClose }: { id: string; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const native = useRef(false);
  const pendingSwitch = useRef<{ time: number; playing: boolean } | null>(null);
  const restored = useRef(false);
  const lastSaved = useRef(0);
  const [info, setInfo] = useState<PlaybackInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [quality, setQuality] = useState('auto');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [qualityNote, setQualityNote] = useState('');
  const [reload, setReload] = useState(0);
  const [shareMessage, setShareMessage] = useState('');

  function savePosition(force = false) {
    const video = ref.current;
    if (!video || video.readyState < 1 || !Number.isFinite(video.currentTime)) return;
    if (!force && Date.now() - lastSaved.current < 5000) return;
    lastSaved.current = Date.now();
    try { localStorage.setItem(`watch:${id}`, String(video.currentTime)); } catch { /* Playback works without browser storage. */ }
  }
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setInfo(null); setError(''); setLoading(true); setShareMessage('');
    async function load() {
      try {
        const video = await publicApi<PlaybackInfo>(`videos/${encodeURIComponent(id)}/playback`, controller.signal);
        if (controller.signal.aborted) return;
        setInfo(video); setLoading(video.status === 'READY');
        if (['UPLOADING', 'UPLOADED', 'PROCESSING', 'RETRYING'].includes(video.status)) timer = setTimeout(() => void load(), 3000);
      } catch {
        if (!controller.signal.aborted) { setError('Unable to load this session. Check your connection and try again.'); setLoading(false); }
      }
    }
    void load();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [id, reload]);

  useEffect(() => {
    const video = ref.current;
    if (!video || info?.status !== 'READY' || !info.manifestUrl) return;
    let disposed = false;
    restored.current = false; pendingSwitch.current = null;
    setError(''); setQuality('auto'); setChoices([]); setQualityNote(''); setLoading(true);
    const sources = renditionSources(info);
    const engine = playbackEngine(video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL'), Hls.isSupported());
    native.current = engine === 'native';
    let hls: Hls | null = null;
    if (engine === 'native') {
      setChoices(sources.map(source => ({ value: `native:${source.height}`, label: `${source.height}p`, url: source.manifestUrl })));
      setQualityNote('Auto lets your device choose the quality for your connection.');
      video.src = info.manifestUrl;
      video.load();
    } else if (engine === 'hls.js') {
      hls = new Hls({ startLevel: -1, maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: 30 });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (disposed || !hls) return;
        setChoices(hls.levels.map((level, index) => {
          const height = levelHeight(level, sources);
          return { value: `hls:${index}`, label: height ? `${height}p` : `${Math.round(level.bitrate / 1000)} kbps` };
        }).reverse());
        setQualityNote('Auto adapts quality as the available bandwidth changes.');
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (disposed || !hls) return;
        const height = levelHeight(hls.levels[data.level], sources);
        if (height) setQualityNote(`Playing ${height}p${hls.autoLevelEnabled ? ' · Auto quality' : ''}`);
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!disposed && data.fatal) {
          setLoading(false);
          setError(data.type === Hls.ErrorTypes.NETWORK_ERROR
            ? 'The video could not be downloaded. Check your connection and try again.'
            : 'This browser could not play the video stream. Try again or use another browser.');
        }
      });
      hls.loadSource(info.manifestUrl); hls.attachMedia(video);
    } else {
      setError('This browser does not support this video stream. Try a current browser or a native HLS player.'); setLoading(false);
    }
    const persist = () => savePosition(true);
    window.addEventListener('pagehide', persist);
    return () => {
      disposed = true; window.removeEventListener('pagehide', persist);
      savePosition(true); video.pause(); hls?.destroy(); hlsRef.current = null;
      video.removeAttribute('src'); video.load();
    };
  }, [info]);

  function metadataLoaded() {
    const video = ref.current;
    if (!video) return;
    setLoading(false);
    if (pendingSwitch.current) {
      const saved = pendingSwitch.current; pendingSwitch.current = null; restored.current = true;
      if (Number.isFinite(video.duration)) video.currentTime = Math.min(Math.max(0, saved.time), Math.max(0, video.duration - 0.1));
      if (saved.playing) void video.play().catch(() => setQualityNote('Quality changed. Press Play to continue.'));
    } else if (!restored.current) {
      restored.current = true;
      let position = 0;
      try { position = Number(localStorage.getItem(`watch:${id}`) || 0); } catch { /* Optional per-device resume. */ }
      const safe = resumePosition(position, video.duration);
      if (safe > 0) video.currentTime = safe;
    }
  }
  function changeQuality(value: string) {
    const video = ref.current;
    if (!video || !info?.manifestUrl) return;
    setQuality(value); setError('');
    if (native.current) {
      const url = value === 'auto' ? info.manifestUrl : choices.find(choice => choice.value === value)?.url;
      if (!url) return;
      let position = video.currentTime || 0;
      if (!restored.current) {
        try { const saved = Number(localStorage.getItem(`watch:${id}`) || 0); if (Number.isFinite(saved) && saved > 0) position = saved; } catch { /* Optional resume. */ }
      }
      pendingSwitch.current = { time: position, playing: !video.paused };
      video.pause(); setLoading(true); video.src = url; video.load();
      setQualityNote(value === 'auto' ? 'Auto lets your device adapt the quality.' : `${choices.find(choice => choice.value === value)?.label} selected. Switching may briefly buffer.`);
    } else if (hlsRef.current) {
      hlsRef.current.currentLevel = value === 'auto' ? -1 : Number(value.slice(4));
    }
  }
  function keyboard(event: React.KeyboardEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (event.target !== video) return;
    // Space belongs to the native video controls, including their keyup behavior.
    // Handling it here as well can toggle playback twice for one press.
    if (event.key === ' ') return;
    if (event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (event.repeat) return;
      if (video.paused) void video.play().catch(() => setQualityNote('Press the player Play control to begin.'));
      else video.pause();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (event.key === 'ArrowRight' ? 10 : -10)));
    } else if (event.key.toLowerCase() === 'm') { event.preventDefault(); if (!event.repeat) video.muted = !video.muted; }
  }
  async function copyLink() {
    const url = new URL(window.location.href); url.hash = watchHash(id);
    try { await navigator.clipboard.writeText(url.toString()); setShareMessage('Session link copied.'); }
    catch { setShareMessage(`Copy this session link: ${url}`); }
  }
  const ready = info?.status === 'READY' && !!info.manifestUrl;
  return <section className="video-player" aria-label="Session player">
    <div className="player-heading">
      <h2>{info?.title || 'Session player'}</h2>
      <div className="actions">
        {info?.id && <button type="button" className="secondary" onClick={() => void copyLink()}>Copy session link</button>}
        <button type="button" className="secondary" onClick={onClose}>Close player</button>
      </div>
    </div>
    {info?.description && <p className="session-description">{info.description}</p>}
    {!info && !error && <p role="status">Loading session…</p>}
    {info && !ready && <p role="status">{stateMessage(info.status)}</p>}
    {ready && <>
      <video ref={ref} crossOrigin="anonymous" controls playsInline preload="metadata" poster={info.poster || undefined} tabIndex={0}
        aria-label={`Video: ${info.title || 'session'}`} aria-describedby="player-duration player-keyboard-help"
        onLoadedMetadata={metadataLoaded} onCanPlay={() => setLoading(false)} onPlaying={() => setLoading(false)}
        onWaiting={() => setLoading(true)} onTimeUpdate={() => savePosition()} onPause={() => savePosition(true)}
        onEnded={() => { try { localStorage.removeItem(`watch:${id}`); } catch { /* Optional. */ } }}
        onKeyDown={keyboard} onError={() => {
          setLoading(false); setError('The video could not be played. Check your connection or try another browser.');
        }} />
      <div className="player-toolbar">
        <label>Playback quality
          <select aria-describedby={info.duration != null ? "player-duration" : undefined} value={quality} onChange={event => changeQuality(event.target.value)} disabled={!choices.length}>
            <option value="auto">Auto</option>
            {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select>
        </label>
        {info.duration != null && <p id="player-duration" tabIndex={0} role="group" aria-label={spokenDuration(info.duration)}><span aria-hidden="true">Duration: {formatDuration(info.duration)}</span><span className="duration-accessible">{spokenDuration(info.duration)}</span></p>}
      </div>
      <p className="progress-note" role="status">{loading && !error ? 'Loading video… ' : ''}{qualityNote}</p>
      <p className="progress-note" id="player-keyboard-help">Player keyboard: Space or K to play/pause · Left/Right to seek 10 seconds · M to mute. Tab reaches quality and player controls.</p>
    </>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {(error || (info && !ready && !['UPLOADING', 'UPLOADED', 'PROCESSING', 'RETRYING'].includes(info.status))) &&
      <button type="button" onClick={() => setReload(value => value + 1)}>Try again</button>}
    {shareMessage && <p role="status" style={{ overflowWrap: 'anywhere' }}>{shareMessage}</p>}
  </section>;
}
export function formatDuration(value: unknown) {
  const seconds = Number(value);
  if (value == null || !Number.isFinite(seconds) || seconds <= 0) return 'Duration pending';
  const total = Math.floor(seconds), hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    : `${minutes}:${String(total % 60).padStart(2, '0')}`;
}
