import assert from 'node:assert/strict';
import test from 'node:test';
import { createReadingTimer } from './readingTimer';

test('background checkpoints preserve reading before force-quit and do not count hidden time', () => {
  let now = 0;
  const durations: number[] = [];
  const timer = createReadingTimer(
    (seconds) => durations.push(seconds),
    () => now
  );
  timer.setActive(true);
  now = 20_000;
  timer.setActive(false);
  assert.deepEqual(durations, [20]);
  now = 100_000;
  timer.setActive(true);
  now = 115_000;
  timer.finish();
  timer.finish();
  assert.deepEqual(durations, [20, 15]);
});

test('periodic checkpoints report only new time and ignore accidental visits', () => {
  let now = 0;
  const durations: number[] = [];
  const timer = createReadingTimer(
    (seconds) => durations.push(seconds),
    () => now
  );
  timer.setActive(true);
  now = 30_000;
  timer.checkpoint();
  now = 60_000;
  timer.checkpoint();
  now = 62_000;
  timer.finish();
  assert.deepEqual(durations, [30, 30]);
});
