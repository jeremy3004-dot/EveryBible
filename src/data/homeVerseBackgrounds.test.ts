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
