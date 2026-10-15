import { spokenDuration } from './session-presentation';
import { Play, Search, RefreshCw } from 'lucide-react';
import { filterCatalog, catalogMinutes, type CatalogSort } from './session-presentation';
import React, { useEffect, useRef, useState } from 'react';
import { publicApi } from './api';
import { Player } from './Player';
import { watchHash } from './playback-model';
import type { PublicVideo } from '../../../packages/contracts/src/index';
export function PublicPage({ selected }: { selected: string }) {
  const [videos, setVideos] = useState<PublicVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CatalogSort>('newest');
  const visible = filterCatalog(videos, query, sort);
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
    <div className="public-intro catalog-intro"><span className="eyebrow">UGN VIDEO SESSIONS</span>
      <h1>Find your next <span>detour.</span></h1><p>Full sets. Fresh discoveries. Press play and stay a while.</p>
      {!loading && !error && videos.length > 0 && <div className="catalog-stats" aria-label="Published library">
        <span><strong>{videos.length}</strong> {videos.length === 1 ? 'session' : 'sessions'}</span>
        <span><strong>{catalogMinutes(videos).toLocaleString()}</strong> minutes to explore</span>
      </div>}
    </div>
    {selected && <div ref={container} tabIndex={-1} className="player-anchor">
      <Player key={selected} id={selected} onClose={() => { window.location.hash = '/watch'; }} />
    </div>}
    <div className="catalog-heading"><h2>Ready to watch</h2><button type="button" className="secondary" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Refresh sessions</button></div>
    {videos.length > 0 && <div className="catalog-tools">
      <label htmlFor="catalog-search"><span><Search size={16} aria-hidden="true" /> Find a session</span>
        <input id="catalog-search" type="search" value={query} placeholder="Search titles and descriptions"
          onChange={event => setQuery(event.target.value)} /></label>
      <label htmlFor="catalog-sort">Sort sessions<select id="catalog-sort" value={sort}
        onChange={event => setSort(event.target.value as CatalogSort)}>
        <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option>
      </select></label>
      <p role="status" aria-live="polite" aria-atomic="true">{visible.length} of {videos.length} sessions</p>
    </div>}
    {loading && <p role="status">Loading sessions…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {!loading && !error && !videos.length && <section><h3>The next session is on its way.</h3><p>Published videos will appear here when processing finishes. Check back soon.</p></section>}
    {!loading && !error && videos.length > 0 && !visible.length && <section>
      <h3>No sessions match your search.</h3><p>Try another title or a word from the description.</p>
      <button type="button" className="secondary" onClick={() => setQuery('')}>Clear search</button>
    </section>}
    <div className="grid">
      {visible.map(video => <article key={video.id} className="session-card public-card">
        <a href={watchHash(video.id)} onClick={() => focusSelected(video.id)} className="poster-link" aria-label={`Watch ${video.title}. ${spokenDuration(video.duration)}`}>
          <div className="session-preview"><img crossOrigin="anonymous" src={video.poster} alt="" loading="lazy" className="preview-loaded"
            onError={event => { event.currentTarget.style.display = 'none'; }} /><span className="poster-play" aria-hidden="true"><Play size={25} /></span></div>
        </a>
        <h3><a href={watchHash(video.id)} onClick={() => focusSelected(video.id)}>{video.title}</a></h3>
        <div className="catalog-metadata" tabIndex={0} role="group"
          aria-label={`${video.title}. ${spokenDuration(video.duration)}. Added ${new Date(video.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.`}>
        <p className="catalog-duration">{spokenDuration(video.duration)}</p>
        <p className="catalog-date">Added <time dateTime={video.createdAt}>{new Date(video.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></p>
        </div>
        {video.description && <p className="catalog-description">{video.description}</p>}
        <a className="button-link" aria-label={`Watch session: ${video.title}. ${spokenDuration(video.duration)}`} href={watchHash(video.id)} onClick={() => focusSelected(video.id)}><Play size={16} aria-hidden="true" /> Watch session</a>
      </article>)}
    </div>
    <footer><p>Underground Nights · Video sessions</p></footer>
  </main>;
}
