import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBibleNowPlayingPayload } from './audioNowPlayingModel';

test('buildBibleNowPlayingPayload maps audio state to lock-screen metadata', () => {
  const payload = buildBibleNowPlayingPayload({
    translationId: 'bsb',
    bookId: 'GEN',
    chapter: 1,
    positionMs: 12_500,
    durationMs: 65_000,
    isPlaying: true,
    playbackRate: 1,
  });

  assert.equal(payload?.title, 'Genesis 1');
  assert.equal(payload?.artist, 'Berean Standard Bible');
  assert.equal(payload?.albumTitle, 'Every Bible');
  assert.equal(payload?.elapsedSeconds, 12.5);
  assert.equal(payload?.durationSeconds, 65);
  assert.equal(payload?.playbackRate, 1);
  assert.equal(payload?.isPlaying, true);
  assert.equal(typeof payload?.artworkUri, 'string');
  assert.ok(payload?.artworkUri && payload.artworkUri.length > 0);
});
