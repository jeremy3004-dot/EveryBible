import assert from 'node:assert/strict';
import test from 'node:test';
import { getHomeVerseBackgroundIndex } from './homeVerseBackgroundSelection';

test('home verse backgrounds rotate in a stable daily cycle', () => {
  const backgroundCount = 14;

  assert.ok(backgroundCount >= 2);
  assert.equal(getHomeVerseBackgroundIndex(new Date(2026, 0, 1), backgroundCount), 0);
  assert.equal(getHomeVerseBackgroundIndex(new Date(2026, 0, 2), backgroundCount), 1);
  assert.equal(
    getHomeVerseBackgroundIndex(new Date(2026, 0, 1 + backgroundCount), backgroundCount),
    0
  );
});

test('no two consecutive days share a photograph, across year ends and leap days', () => {
  const backgroundCount = 14;
  // 364 is a multiple of 14, so a count that restarts each 1 January repeated the photo of
  // 31 December in every non-leap year.
  for (let day = new Date(2025, 0, 1); day < new Date(2030, 0, 1); ) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    assert.notEqual(
      getHomeVerseBackgroundIndex(day, backgroundCount),
      getHomeVerseBackgroundIndex(next, backgroundCount),
      `${day.toDateString()} and ${next.toDateString()}`
    );
    day = next;
  }
});

test('the photograph is chosen by the local calendar day, not the time of day', () => {
  assert.equal(
    getHomeVerseBackgroundIndex(new Date(2026, 11, 31, 0, 0), 14),
    getHomeVerseBackgroundIndex(new Date(2026, 11, 31, 23, 59), 14)
  );
});
