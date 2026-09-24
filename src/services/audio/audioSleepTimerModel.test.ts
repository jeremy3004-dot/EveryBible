import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSleepTimerExpired, sleepTimerRemainingMinutes } from './audioSleepTimerModel';

test('a running sleep timer expires at its end time', () => {
  assert.equal(hasSleepTimerExpired(10_000, 9_999), false);
  assert.equal(hasSleepTimerExpired(10_000, 10_000), true);
  assert.equal(hasSleepTimerExpired(10_000, 12_000), true);
});

test('a paused or unset sleep timer never expires', () => {
  assert.equal(hasSleepTimerExpired(null, Number.MAX_SAFE_INTEGER), false);
});

test('a running sleep timer counts whole minutes up to its end', () => {
  assert.equal(sleepTimerRemainingMinutes(1_000 + 15 * 60_000, 1_000, null), 15);
  assert.equal(sleepTimerRemainingMinutes(1_000 + 14 * 60_000 + 1, 1_000, null), 15);
  assert.equal(sleepTimerRemainingMinutes(1_000, 5_000, null), 0);
});

test('a paused sleep timer shows the time frozen in the store', () => {
  assert.equal(sleepTimerRemainingMinutes(null, 1_000, 5 * 60_000), 5);
  assert.equal(sleepTimerRemainingMinutes(null, 1_000, 90_000), 2);
});

test('no sleep timer has no remaining time', () => {
  assert.equal(sleepTimerRemainingMinutes(null, 1_000, null), null);
});
