import type { PublicVideo } from '../../../packages/contracts/src/index';
export type CatalogSort = 'newest' | 'oldest' | 'title';
export function presetLabel(value: unknown): string {
  if (value === 'standard') return 'Standard · up to 30 fps';
  if (value === 'smooth') return 'Smooth motion · up to 60 fps';
  if (value === 'original' || value == null) return 'Original frame rate';
  return 'Preset unavailable';
}
export function filterCatalog(videos: PublicVideo[], query: string, sort: CatalogSort): PublicVideo[] {
  const search = query.trim().toLocaleLowerCase();
  const timestamp = (value: string) => { const time = Date.parse(value); return Number.isFinite(time) ? time : 0; };
  return videos.filter(video => !search || `${video.title} ${video.description}`.toLocaleLowerCase().includes(search))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
      : (sort === 'oldest' ? 1 : -1) * (timestamp(a.createdAt) - timestamp(b.createdAt)) || a.id.localeCompare(b.id));
}
export function catalogMinutes(videos: PublicVideo[]): number {
  return Math.floor(videos.reduce((total, item) => total + (typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration > 0 ? item.duration : 0), 0) / 60);
}

export function spokenDuration(value: unknown): string {
  const seconds = Number(value);
  if (value == null || !Number.isFinite(seconds) || seconds <= 0) return 'Duration pending';
  const total = Math.floor(seconds);
  const parts = [[Math.floor(total / 3600), 'hour'], [Math.floor(total / 60) % 60, 'minute'], [total % 60, 'second']] as const;
  return 'Duration: ' + (parts.filter(([count]) => count > 0).map(([count, unit]) => `${count} ${unit}${count === 1 ? '' : 's'}`).join(', ') || '0 seconds');
}
