import assert from 'node:assert/strict';
import test from 'node:test';
import { elapsedListeningMs } from './listeningTime';

test('paused clocks contribute no time and backwards wall clocks never subtract usage', () => {
  assert.equal(elapsedListeningMs(0, 300_000), 0);
  assert.equal(elapsedListeningMs(1000, 31_000), 30_000);
  assert.equal(elapsedListeningMs(10_000, 1000), 0);
});
