import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playbackMetadata, catalogMetadata } from '../src/playback';
const video = { id: 'one', title: 'Test session', description: 'Artist and set notes', status: 'READY', duration: 36000,
  createdAt: new Date('2026-10-15T00:00:00Z'), filename: 'private-original.mp4', uploadId: 'private-upload', error: 'private-error' };
test('READY playback exposes master, poster and three explicit native rendition URLs', () => {
  const data = playbackMetadata(video, 'http://localhost:9000/media/');
  assert.equal(data.manifestUrl, 'http://localhost:9000/media/videos/one/master.m3u8');
  assert.equal(data.poster, 'http://localhost:9000/media/videos/one/poster.jpg');
  assert.deepEqual(data.renditions, [1080, 720, 480]);
  assert.deepEqual(data.sources.map(source => source.manifestUrl), [1080, 720, 480].map(height => `http://localhost:9000/media/videos/one/${height}.m3u8`));
  assert.equal(data.duration, 36000);
});
test('all non-ready states expose no playable URLs or original-storage keys', () => {
  for (const status of ['UPLOADING', 'UPLOADED', 'PROCESSING', 'RETRYING', 'STOPPING', 'STOPPED', 'FAILED', 'DELETING']) {
    const data = playbackMetadata({ ...video, status }, 'https://media.example');
    assert.equal(data.status, status); assert.equal(data.manifestUrl, null); assert.equal(data.poster, null);
    assert.deepEqual(data.sources, []); assert.deepEqual(data.renditions, []);
    assert.equal('filename' in data, false); assert.equal('uploadId' in data, false); assert.equal('error' in data, false);
  }
});
test('missing session yields a predictable NOT_FOUND public payload', () => {
  assert.deepEqual(playbackMetadata(null, 'https://media.example'), { status: 'NOT_FOUND', manifestUrl: null, poster: null, renditions: [], sources: [] });
});
test('public catalog serialization includes poster/date and no admin-only data', () => {
  const data = catalogMetadata(video, 'https://cdn.example/media');
  assert.deepEqual(Object.keys(data).sort(), ['id', 'title', 'description', 'duration', 'createdAt', 'poster'].sort());
  assert.equal(data.createdAt, '2026-10-15T00:00:00.000Z'); assert.match(data.poster, /^https:\/\/cdn\.example/);
});
