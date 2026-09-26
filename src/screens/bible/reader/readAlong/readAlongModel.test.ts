import test from 'node:test';
import assert from 'node:assert/strict';
import { FOLLOW_ALONG_TIMESTAMP_LEAD_MS } from '../../bibleReaderModel';
import {
  READ_ALONG_BACKWARD_TOLERANCE_MS,
  READ_ALONG_FALLBACK_TEXT_TRANSLATION_ID,
  READ_ALONG_MANUAL_SCROLL_PAUSE_MS,
  getReadAlongProgress,
  getReadAlongScrollOffset,
  getReadAlongTextCandidates,
  getTimedVerse,
  resolveShownVerse,
  resolveTimedVerse,
  shouldAutoFollow,
} from './readAlongModel';

// Verse 1 at 0s, 2 at 4s, 3 at 9.5s; verse 4 has no timing of its own; 5 at 20s.
const timings = { 1: 0, 2: 4, 3: 9.5, 5: 20 };

test('the timed verse is the last one whose start the position has reached', () => {
  assert.equal(getTimedVerse(timings, 0), 1);
  assert.equal(getTimedVerse(timings, 3_000), 1);
  assert.equal(getTimedVerse(timings, 4_000), 2);
  assert.equal(getTimedVerse(timings, 15_000), 3);
  assert.equal(getTimedVerse(timings, 60_000), 5);
});

test('the timed verse starts a moment early, as the reader highlights it', () => {
  assert.equal(getTimedVerse(timings, 4_000 - FOLLOW_ALONG_TIMESTAMP_LEAD_MS), 2);
  assert.equal(getTimedVerse(timings, 4_000 - FOLLOW_ALONG_TIMESTAMP_LEAD_MS - 1), 1);
});

test('without timings, or before a position is known, there is no timed verse', () => {
  assert.equal(getTimedVerse(null, 5_000), null);
  assert.equal(getTimedVerse(undefined, 5_000), null);
  assert.equal(getTimedVerse({}, 5_000), null);
  assert.equal(getTimedVerse(timings, -1), null);
  assert.equal(getTimedVerse(timings, Number.NaN), null);
});

test('timings out of order still resolve by verse order', () => {
  assert.equal(getTimedVerse({ 3: 9, 1: 0, 2: 4 }, 5_000), 2);
});

test('a small step back in position keeps the verse shown; a real seek back moves it', () => {
  // The last tick showed verse 2 at 4.1s; a poll lands at 3.9s.
  assert.equal(resolveTimedVerse({ timestamps: timings, positionMs: 3_800, previousVerse: 2 }), 2);
  // A seek back to 1s is further than the tolerance.
  assert.equal(resolveTimedVerse({ timestamps: timings, positionMs: 1_000, previousVerse: 2 }), 1);
  // Forward always moves.
  assert.equal(resolveTimedVerse({ timestamps: timings, positionMs: 10_000, previousVerse: 2 }), 3);
});

test('the shown verse only holds back within the tolerance window', () => {
  assert.equal(resolveShownVerse({ verseAtPosition: 1, verseAhead: 2, previousVerse: 2 }), 2);
  assert.equal(resolveShownVerse({ verseAtPosition: 1, verseAhead: 1, previousVerse: 2 }), 1);
  assert.equal(resolveShownVerse({ verseAtPosition: 3, verseAhead: 3, previousVerse: 2 }), 3);
  assert.equal(resolveShownVerse({ verseAtPosition: null, verseAhead: 2, previousVerse: 2 }), null);
  assert.equal(resolveShownVerse({ verseAtPosition: 1, verseAhead: 1, previousVerse: null }), 1);
  assert.ok(READ_ALONG_BACKWARD_TOLERANCE_MS < 1_500, 'a tolerance shorter than a verse');
});

test('auto-follow pauses after a manual scroll and resumes once the pause has passed', () => {
  assert.equal(shouldAutoFollow({ nowMs: 10_000, lastManualScrollAtMs: null }), true);
  assert.equal(shouldAutoFollow({ nowMs: 10_000, lastManualScrollAtMs: 9_000 }), false);
  assert.equal(
    shouldAutoFollow({
      nowMs: 9_000 + READ_ALONG_MANUAL_SCROLL_PAUSE_MS - 1,
      lastManualScrollAtMs: 9_000,
    }),
    false
  );
  assert.equal(
    shouldAutoFollow({
      nowMs: 9_000 + READ_ALONG_MANUAL_SCROLL_PAUSE_MS,
      lastManualScrollAtMs: 9_000,
    }),
    true
  );
});

test('the current verse is scrolled to a third of the way down, never past the top', () => {
  assert.equal(getReadAlongScrollOffset({ verseTopY: 1_000, viewportHeight: 600 }), 820);
  assert.equal(getReadAlongScrollOffset({ verseTopY: 100, viewportHeight: 600 }), 0);
});

test('progress is the played share of the chapter, clamped, and zero before a duration', () => {
  assert.equal(getReadAlongProgress(30_000, 120_000), 0.25);
  assert.equal(getReadAlongProgress(130_000, 120_000), 1);
  assert.equal(getReadAlongProgress(-5, 120_000), 0);
  assert.equal(getReadAlongProgress(30_000, 0), 0);
});

test('text is looked for in the recording translation, then in the bundled BSB', () => {
  const fallback = { translationId: READ_ALONG_FALLBACK_TEXT_TRANSLATION_ID, isFallback: true };
  assert.deepEqual(
    getReadAlongTextCandidates({ translationId: 'web', translation: { hasText: true } }),
    [{ translationId: 'web', isFallback: false }, fallback]
  );
  // An audio-only recording has no text of its own to try.
  assert.deepEqual(
    getReadAlongTextCandidates({ translationId: 'npi-audio', translation: { hasText: false } }),
    [fallback]
  );
  // A translation the catalog has not described yet is tried first.
  assert.deepEqual(getReadAlongTextCandidates({ translationId: 'xyz', translation: undefined }), [
    { translationId: 'xyz', isFallback: false },
    fallback,
  ]);
  // BSB is its own text.
  assert.deepEqual(
    getReadAlongTextCandidates({ translationId: 'bsb', translation: { hasText: true } }),
    [{ translationId: 'bsb', isFallback: false }]
  );
});
