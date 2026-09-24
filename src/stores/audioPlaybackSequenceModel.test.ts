import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdjacentAudioPlaybackSequenceEntry,
  hasAudioPlaybackSequenceEntry,
} from './audioPlaybackSequenceModel';

const harvestSequence = [
  { bookId: 'MAT', chapter: 1 },
  { bookId: 'MAT', chapter: 2 },
  { bookId: 'LUK', chapter: 1 },
  { bookId: 'LUK', chapter: 2 },
];

test('finds adjacent playback targets across books inside a harvest-style sequence', () => {
  assert.deepEqual(getAdjacentAudioPlaybackSequenceEntry(harvestSequence, 'MAT', 2, 1), {
    bookId: 'LUK',
    chapter: 1,
  });
  assert.deepEqual(getAdjacentAudioPlaybackSequenceEntry(harvestSequence, 'LUK', 1, -1), {
    bookId: 'MAT',
    chapter: 2,
  });
});

test('detects whether the active chapter still belongs to the current playback sequence', () => {
  assert.equal(hasAudioPlaybackSequenceEntry(harvestSequence, 'LUK', 2), true);
  assert.equal(hasAudioPlaybackSequenceEntry(harvestSequence, 'MAT', 9), false);
});
