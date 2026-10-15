import type { EncodingPreset } from '../../../packages/contracts/src/index';
export function frameRateFilter(preset: string, rate: string | undefined): string | null {
  if (!['standard', 'smooth', 'original'].includes(preset)) throw new Error('Unknown encoding preset');
  if (preset === 'original') return null;
  const cap = preset === 'standard' ? 30 : 60;
  const [numerator, denominator = '1'] = (rate || '').split('/').map(Number);
  const fps = numerator / Number(denominator);
  if (Number.isFinite(fps) && fps > 0 && fps <= cap) return null;
  // Preserve common NTSC relationships: 119.88 -> 59.94 / 29.97.
  const ntscMultiple = fps / (30000 / 1001);
  const ntsc = Number.isFinite(fps) && Math.abs(ntscMultiple - Math.round(ntscMultiple)) < 0.001;
  return `fps=${ntsc ? (cap === 30 ? '30000/1001' : '60000/1001') : cap}`;
}
export function renditionFilter(preset: EncodingPreset | string, rate: string | undefined, height: number) {
  const fps = frameRateFilter(preset, rate);
  return [fps, `scale=-2:${height}`].filter(Boolean).join(',');
}
