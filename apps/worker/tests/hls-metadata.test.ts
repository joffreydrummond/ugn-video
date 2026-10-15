import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measurePlaylist, masterPlaylist } from '../src/hls-metadata';
test('bandwidth includes complete segments and handles a short final segment', () => {
  const result = measurePlaylist('#EXTM3U\n#EXTINF:6.0,\na.ts\n#EXTINF:1.0,\nb.ts\n', new Map([['a.ts', 600000], ['b.ts', 200000]]));
  assert.equal(result.bandwidth, 1760000);
  assert.equal(result.averageBandwidth, Math.ceil(800000 * 8 / 7));
});
test('missing segment and empty playlists cannot be published', () => {
  assert.throws(() => measurePlaylist('#EXTINF:6,\nmissing.ts', new Map()));
  assert.throws(() => measurePlaylist('#EXTM3U', new Map()));
});
test('master advertises encoded dimensions and measured bandwidth', () => {
  const text = masterPlaylist([{ width: 854, height: 480, bandwidth: 900000, averageBandwidth: 700000 }]);
  assert.match(text, /BANDWIDTH=900000,AVERAGE-BANDWIDTH=700000,RESOLUTION=854x480\n480.m3u8/);
  assert.throws(() => masterPlaylist([{ width: NaN, height: 480, bandwidth: 1, averageBandwidth: 1 }]));
});
