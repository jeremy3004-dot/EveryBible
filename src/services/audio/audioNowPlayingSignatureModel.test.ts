import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bibleNowPlayingSignature,
  type BibleNowPlayingSignatureInput,
} from './audioNowPlayingSignatureModel';

const entry: BibleNowPlayingSignatureInput = {
  translationId: 'bsb',
  bookId: 'JHN',
  bookName: 'John',
  chapter: 3,
  positionMs: 12_345,
  durationMs: 300_999,
  isPlaying: true,
  playbackRate: 1.25,
  canSkipNext: true,
  canSkipPrevious: false,
};

test('the signature names everything the lock screen shows, at whole seconds', () => {
  assert.equal(bibleNowPlayingSignature(entry), 'bsb|JHN|3|12|300|1|1.25|1|0|John');
});

test('progress within the same second keeps the signature', () => {
  assert.equal(
    bibleNowPlayingSignature({ ...entry, positionMs: 12_999 }),
    bibleNowPlayingSignature(entry)
  );
});

test('any visible change produces a new signature', () => {
  const changes: Partial<BibleNowPlayingSignatureInput>[] = [
    { translationId: 'web' },
    { bookId: 'ROM' },
    { bookName: 'Juan' },
    { chapter: 4 },
    { positionMs: 13_000 },
    { durationMs: 302_000 },
    { isPlaying: false },
    { playbackRate: 1 },
    { canSkipNext: false },
    { canSkipPrevious: true },
  ];

  for (const change of changes) {
    assert.notEqual(
      bibleNowPlayingSignature({ ...entry, ...change }),
      bibleNowPlayingSignature(entry),
      JSON.stringify(change)
    );
  }
});
