import type { PlaybackInfo, PlaybackRendition } from '../../../packages/contracts/src/index';
export function playbackEngine(nativeHls: string, supportsHlsJs: boolean) {
  return nativeHls ? 'native' : supportsHlsJs ? 'hls.js' : 'unsupported';
}
export function resumePosition(saved: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(saved) || saved <= 0 || saved >= duration - 2) return 0;
  return saved;
}
export function renditionSources(info: PlaybackInfo): PlaybackRendition[] {
  if (info.sources?.length) return info.sources;
  // Compatibility with the previous playback API, if the frontend is updated first.
  if (!info.manifestUrl) return [];
  return (info.renditions || []).map(height => ({ height,
    manifestUrl: info.manifestUrl!.replace(/master\.m3u8(?=\?|$)/, `${height}.m3u8`) }));
}
export function levelHeight(level: { height?: number; url?: string | string[] }, sources: PlaybackRendition[]) {
  if (level.height && level.height > 0) return level.height;
  const urls = Array.isArray(level.url) ? level.url : [level.url || ''];
  for (const url of urls) {
    const known = sources.find(source => source.manifestUrl.split('?')[0] === url.split('?')[0]);
    if (known) return known.height;
    const match = url.match(/\/(\d+)\.m3u8(?:\?|$)/);
    if (match) return Number(match[1]);
  }
  return 0;
}
export function stateMessage(status: string) {
  if (['UPLOADING', 'UPLOADED', 'PROCESSING', 'RETRYING'].includes(status)) return 'This session is still being prepared. This page will update when it is ready.';
  if (status === 'FAILED') return 'This session could not be processed. Please try another session or check back later.';
  if (['STOPPING', 'STOPPED'].includes(status)) return 'Processing for this session has been stopped. It is not available to watch yet.';
  if (status === 'DELETING' || status === 'NOT_FOUND') return 'This session could not be found. It may have been removed.';
  return 'This session is not available to watch.';
}
export function watchHash(id: string) { return `#/watch/${encodeURIComponent(id)}`; }
export function routeFromHash(hash: string): { page: 'admin' | 'public'; id: string } {
  if (hash === '#/admin' || hash === '#/admin/') return { page: 'admin', id: '' };
  const match = hash.match(/^#\/watch\/([^/?#]+)\/?$/);
  try { return { page: 'public', id: match ? decodeURIComponent(match[1]) : '' }; }
  catch { return { page: 'public', id: '' }; }
}
