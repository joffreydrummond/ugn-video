import type { PlaybackInfo, PublicVideo } from '../../../packages/contracts/src/index';

type VideoMetadata = { id: string; title: string; description: string; status: string; duration: number | null; createdAt: Date };
const root = (base: string) => base.replace(/\/+$/, '');
export function playbackMetadata(video: VideoMetadata | null, publicUrl: string): PlaybackInfo {
  if (!video) return { status: 'NOT_FOUND', manifestUrl: null, poster: null, renditions: [], sources: [] };
  const ready = video.status === 'READY';
  const prefix = `${root(publicUrl)}/videos/${encodeURIComponent(video.id)}`;
  return {
    id: video.id, title: video.title, description: video.description,
    status: video.status as PlaybackInfo['status'], duration: video.duration, createdAt: video.createdAt.toISOString(),
    manifestUrl: ready ? `${prefix}/master.m3u8` : null,
    poster: ready ? `${prefix}/poster.jpg` : null,
    renditions: ready ? [1080, 720, 480] : [],
    sources: ready ? [1080, 720, 480].map(height => ({ height, manifestUrl: `${prefix}/${height}.m3u8` })) : [],
  };
}
export function catalogMetadata(video: VideoMetadata, publicUrl: string): PublicVideo {
  return { id: video.id, title: video.title, description: video.description,
    duration: video.duration, createdAt: video.createdAt.toISOString(),
    poster: `${root(publicUrl)}/videos/${encodeURIComponent(video.id)}/poster.jpg` };
}
