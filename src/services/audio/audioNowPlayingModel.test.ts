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

test('buildBibleNowPlayingPayload still builds lock-screen metadata for runtime translations not in the static list', () => {
  // Runtime (open-bible catalog) translations have IDs unknown to getTranslationById.
  // They must NOT return null — that would cause clearBibleNowPlaying() to be called
  // and make the lock-screen player disappear while audio is playing.
  const payload = buildBibleNowPlayingPayload({
    translationId: 'some-runtime-translation-id',
    translationName: 'World English Bible',
    bookId: 'MAT',
    chapter: 5,
    positionMs: 0,
    durationMs: 120_000,
    isPlaying: true,
    playbackRate: 1.25,
  });

  assert.notEqual(payload, null, 'must not return null for an unknown translationId');
  assert.equal(payload?.title, 'Matthew 5');
  assert.equal(payload?.artist, 'World English Bible');
});

test('buildBibleNowPlayingPayload falls back to album title when translationName is absent and translationId is unknown', () => {
  const payload = buildBibleNowPlayingPayload({
    translationId: 'unknown-id',
    bookId: 'JHN',
    chapter: 3,
    positionMs: 0,
    durationMs: 0,
    isPlaying: false,
    playbackRate: 1,
  });

  assert.notEqual(payload, null, 'must not return null for an unknown translationId');
  assert.equal(payload?.title, 'John 3');
  assert.equal(payload?.artist, 'Every Bible');
});
