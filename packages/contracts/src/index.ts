export type VideoStatus = 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'RETRYING' | 'STOPPING' | 'STOPPED' | 'DELETING' | 'READY' | 'FAILED';
export const PART_SIZE = 64 * 1024 * 1024;
export const MAX_BYTES = 20 * 1024 ** 3;

export interface PlaybackRendition {
  height: number;
  manifestUrl: string;
}
export interface PublicVideo {
  id: string;
  title: string;
  description: string;
  duration: number | null;
  createdAt: string;
  poster: string;
}
export interface PlaybackInfo {
  id?: string;
  title?: string;
  description?: string;
  status: VideoStatus | 'NOT_FOUND';
  duration?: number | null;
  createdAt?: string;
  manifestUrl: string | null;
  poster: string | null;
  // Preserve the original numeric list; explicit rendition URLs extend the API.
  renditions: number[];
  sources: PlaybackRendition[];
}
