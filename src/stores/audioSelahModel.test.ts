import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SELAH_MAX_HOLD_MS,
  canSelah,
  resolveSelahDeadline,
  resolveSelahResumePositionMs,
} from './audioSelahModel';

// Verse start times in seconds, as the bundled timing tables hold them. The reader (and
// Selah) read each 150 ms early, so verse 2 "starts" at 9.85 s.
const TIMINGS = { 1: 0.4, 2: 10, 3: 30, 4: 32 };

test('without verse timings the narration picks up 1.5 s before where Selah paused it', () => {
  assert.equal(resolveSelahResumePositionMs(42_000, null), 40_500);
  assert.equal(resolveSelahResumePositionMs(42_000, undefined), 40_500);
});

test('the rewind never goes before the top of the chapter', () => {
  assert.equal(resolveSelahResumePositionMs(900, null), 0);
  assert.equal(resolveSelahResumePositionMs(-5, null), 0);
  assert.equal(resolveSelahResumePositionMs(Number.NaN, null), 0);
});

test('a Selah within 6 s of its verse starting picks up at the start of that verse', () => {
  assert.equal(resolveSelahResumePositionMs(14_000, TIMINGS), 9_850);
  // Only just into the verse: the verse still starts again from its first word.
  assert.equal(resolveSelahResumePositionMs(10_000, TIMINGS), 9_850);
});

test('a Selah further into a long verse rewinds 1.5 s instead', () => {
  assert.equal(resolveSelahResumePositionMs(20_000, TIMINGS), 18_500);
});

test('the verse boundary is exactly 6 s', () => {
  assert.equal(resolveSelahResumePositionMs(9_850 + 6_000, TIMINGS), 9_850);
  assert.equal(resolveSelahResumePositionMs(9_850 + 6_001, TIMINGS), 9_850 + 6_001 - 1_500);
});

test('verse 1 starts at the top, so the spoken chapter heading is heard again', () => {
  assert.equal(resolveSelahResumePositionMs(3_000, TIMINGS), 0);
});

test('a short verse picks up at its own start, not the verse before', () => {
  assert.equal(resolveSelahResumePositionMs(32_500, TIMINGS), 31_850);
});

test('timings with nothing usable fall back to the rewind', () => {
  assert.equal(resolveSelahResumePositionMs(20_000, {}), 18_500);
});

const loaded = {
  backgroundMusicChoice: 'piano' as const,
  currentBookId: 'JHN',
  currentChapter: 3,
};

test('Selah is available while a sound is on and a chapter plays, pauses or buffers', () => {
  assert.deepEqual(
    (['playing', 'paused', 'loading', 'idle', 'error'] as const).map((status) =>
      canSelah({ ...loaded, status })
    ),
    [true, true, true, false, false]
  );
});

test('Selah is unavailable with the background sound off or no chapter', () => {
  assert.equal(canSelah({ ...loaded, backgroundMusicChoice: 'off', status: 'playing' }), false);
  assert.equal(canSelah({ ...loaded, currentBookId: null, status: 'playing' }), false);
  assert.equal(canSelah({ ...loaded, currentChapter: null, status: 'playing' }), false);
  assert.equal(canSelah({ ...loaded, backgroundMusicChoice: 'shuffle', status: 'paused' }), true);
});

test('Selah on its own ends 30 minutes after it began', () => {
  assert.deepEqual(resolveSelahDeadline({ heldSinceMs: 1_000, sleepTimerEndTime: null }), {
    atMs: 1_000 + SELAH_MAX_HOLD_MS,
    reason: 'max-hold',
  });
});

test('a sleep timer that runs out first ends Selah when it does', () => {
  assert.deepEqual(resolveSelahDeadline({ heldSinceMs: 0, sleepTimerEndTime: 10 * 60_000 }), {
    atMs: 10 * 60_000,
    reason: 'sleep-timer',
  });
  assert.deepEqual(
    resolveSelahDeadline({ heldSinceMs: 0, sleepTimerEndTime: SELAH_MAX_HOLD_MS + 1 }),
    { atMs: SELAH_MAX_HOLD_MS, reason: 'max-hold' }
  );
});
