import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playbackEngine, resumePosition, renditionSources, levelHeight, stateMessage, watchHash, routeFromHash } from '../src/playback-model';
import type { PlaybackInfo } from '../../../packages/contracts/src/index';
test('native HLS takes priority and hls.js is a feature-detected fallback', () => {
  assert.equal(playbackEngine('probably', true), 'native'); assert.equal(playbackEngine('', true), 'hls.js'); assert.equal(playbackEngine('', false), 'unsupported');
});
test('resume supports a late position in a 10-hour video without byte arithmetic', () => {
  const position = 7 * 3600 + 42 * 60 + 10;
  assert.equal(resumePosition(position, 36000), position);
});
test('invalid, finished and unknown-duration resume values restart safely', () => {
  for (const saved of [-10, NaN, Infinity, 35999, 36000, 40000]) assert.equal(resumePosition(saved, 36000), 0);
  assert.equal(resumePosition(300, Infinity), 0); assert.equal(resumePosition(300, 0), 0);
});
test('legacy playlists with no RESOLUTION map quality using URLs, not array order', () => {
  const sources = [1080, 720, 480].map(height => ({ height, manifestUrl: `https://cdn.example/${height}.m3u8` }));
  assert.equal(levelHeight({ height: 0, url: ['https://cdn.example/480.m3u8'] }, sources), 480);
  assert.equal(levelHeight({ height: 0, url: ['https://cdn.example/1080.m3u8'] }, sources), 1080);
  assert.equal(levelHeight({ height: 720, url: ['something-else'] }, sources), 720);
});
test('unknown levels do not invent a resolution', () => {
  assert.equal(levelHeight({ url: ['https://cdn.example/variant.m3u8'] }, []), 0);
});
test('explicit quality sources are preferred; old numeric API retains compatibility', () => {
  const old: PlaybackInfo = { status: 'READY', manifestUrl: 'https://cdn.example/master.m3u8', poster: null, renditions: [1080, 720, 480], sources: [] };
  assert.equal(renditionSources(old)[1].manifestUrl, 'https://cdn.example/720.m3u8');
  const sources = [{ height: 720, manifestUrl: 'https://custom.example/path.m3u8' }];
  assert.deepEqual(renditionSources({ ...old, sources }), sources);
});
test('public routing never requires the admin route and preserves shareable IDs', () => {
  assert.deepEqual(routeFromHash(''), { page: 'public', id: '' });
  assert.deepEqual(routeFromHash('#/watch'), { page: 'public', id: '' });
  assert.deepEqual(routeFromHash(watchHash('session one')), { page: 'public', id: 'session one' });
  assert.deepEqual(routeFromHash('#/admin'), { page: 'admin', id: '' });
  assert.deepEqual(routeFromHash('#/watch/%invalid'), { page: 'public', id: '' });
});
test('unavailable and processing states have distinct viewer messages', () => {
  assert.match(stateMessage('PROCESSING'), /will update/); assert.match(stateMessage('FAILED'), /could not be processed/);
  assert.match(stateMessage('STOPPED'), /stopped/); assert.match(stateMessage('NOT_FOUND'), /could not be found/);
});
