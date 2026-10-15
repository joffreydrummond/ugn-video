import React, { useEffect, useRef, useState } from 'react';
import { publicApi } from './api';
import { Player, formatDuration } from './Player';
import { watchHash } from './playback-model';
import type { PublicVideo } from '../../../packages/contracts/src/index';
export function PublicPage({ selected }: { selected: string }) {
  const [videos, setVideos] = useState<PublicVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setError('');
    async function load() {
      try {
        const result = await publicApi<PublicVideo[]>('videos', controller.signal);
        if (!controller.signal.aborted) { setVideos(result); setError(''); }
      } catch {
        if (!controller.signal.aborted) setError('Sessions could not be loaded. Check your connection and try again.');
      } finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(() => void load(), 15000); }
      }
    }
    void load(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [reload]);
  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(() => {
      container.current?.focus({ preventScroll: true });
      container.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);
  function focusSelected(id: string) {
    if (selected !== id) return;
    container.current?.focus({ preventScroll: true });
    container.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  return <main>
    <header>
      <a href="#/watch" className="brand-link">UNDERGROUND NIGHTS</a>
      <nav aria-label="Main navigation"><a href="#/watch" aria-current="page">Watch sessions</a><a href="#/admin">Admin studio</a></nav>
    </header>
    <div className="public-intro"><span className="eyebrow">UGN VIDEO SESSIONS</span><h1>Find your next detour.</h1><p>Full sets. Fresh discoveries. Press play and stay a while.</p></div>
    {selected && <div ref={container} tabIndex={-1} className="player-anchor">
      <Player key={selected} id={selected} onClose={() => { window.location.hash = '/watch'; }} />
    </div>}
    <div className="catalog-heading"><h2>Ready to watch</h2><button type="button" className="secondary" onClick={() => setReload(value => value + 1)}>Refresh sessions</button></div>
    {loading && <p role="status">Loading sessions…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {!loading && !error && !videos.length && <section><h3>The next session is on its way.</h3><p>Published videos will appear here when processing finishes. Check back soon.</p></section>}
    <div className="grid">
      {videos.map(video => <article key={video.id} className="session-card public-card">
        <a href={watchHash(video.id)} onClick={() => focusSelected(video.id)} className="poster-link" aria-label={`Watch ${video.title}`}>
          <div className="session-preview"><img crossOrigin="anonymous" src={video.poster} alt="" loading="lazy" className="preview-loaded"
            onError={event => { event.currentTarget.style.display = 'none'; }} /><span className="poster-duration">{formatDuration(video.duration)}</span></div>
        </a>
        <h3><a href={watchHash(video.id)} onClick={() => focusSelected(video.id)}>{video.title}</a></h3>
        {video.description && <p className="catalog-description">{video.description}</p>}
        <a className="button-link" href={watchHash(video.id)} onClick={() => focusSelected(video.id)}>Watch session</a>
      </article>)}
    </div>
    <footer><p>Underground Nights · Video sessions</p></footer>
  </main>;
}
