import assert from 'node:assert/strict';
import test from 'node:test';

import { getMillisecondsUntilNextLocalMidnight } from './dailyScriptureRefresh';

test('daily scripture refresh waits until the next local midnight', () => {
  assert.equal(
    getMillisecondsUntilNextLocalMidnight(new Date(2026, 3, 1, 10, 15, 30, 0)),
    13 * 60 * 60 * 1000 + 44 * 60 * 1000 + 30 * 1000
  );
});

test('daily scripture refresh handles a time just before midnight', () => {
  assert.equal(
    getMillisecondsUntilNextLocalMidnight(new Date(2026, 3, 1, 23, 59, 59, 250)),
    750
  );
});
