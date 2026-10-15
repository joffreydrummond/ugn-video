export type Rendition = { height: number; width: number; bandwidth: number; averageBandwidth: number };
/** Measure complete MPEG-TS files, including audio and container overhead. */
export function measurePlaylist(playlist: string, sizes: ReadonlyMap<string, number>) {
  const segments = [...playlist.matchAll(/#EXTINF:([0-9.]+)[^\n]*\r?\n([^#\r\n]+)/g)].map(match => {
    const seconds = Number(match[1]);
    const bytes = sizes.get(match[2].trim());
    if (!(seconds > 0) || bytes === undefined || bytes <= 0) throw new Error('Invalid or missing HLS segment');
    return { seconds, bytes };
  });
  if (!segments.length) throw new Error('HLS playlist contains no segments');
  const seconds = segments.reduce((sum, item) => sum + item.seconds, 0);
  const bytes = segments.reduce((sum, item) => sum + item.bytes, 0);
  // Any contiguous window's rate cannot exceed its fastest constituent segment.
  // A 10% margin provides a conservative ABR ceiling instead of omitting audio overhead.
  return { bandwidth: Math.ceil(segments.reduce((peak, item) => Math.max(peak, item.bytes * 8 / item.seconds), 0) * 110 / 100),
    averageBandwidth: Math.ceil(bytes * 8 / seconds) };
}
export function masterPlaylist(renditions: Rendition[]) {
  if (!renditions.length) throw new Error('No HLS renditions');
  return '#EXTM3U\n' + renditions.map(item => {
    if (![item.width, item.height, item.bandwidth, item.averageBandwidth].every(n => Number.isSafeInteger(n) && n > 0)) {
      throw new Error('Invalid HLS rendition metadata');
    }
    return `#EXT-X-STREAM-INF:BANDWIDTH=${item.bandwidth},AVERAGE-BANDWIDTH=${item.averageBandwidth},RESOLUTION=${item.width}x${item.height}\n${item.height}.m3u8`;
  }).join('\n') + '\n';
}
