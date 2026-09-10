import test from 'node:test';
import assert from 'node:assert/strict';

import { formatPlaybackTime } from './time';

test('formatPlaybackTime renders a whole number of minutes and seconds', () => {
  assert.equal(formatPlaybackTime(187_000), '3:07');
});

test('formatPlaybackTime renders zero as 0:00', () => {
  assert.equal(formatPlaybackTime(0), '0:00');
});

test('formatPlaybackTime truncates a partial second rather than rounding up', () => {
  assert.equal(formatPlaybackTime(1_999), '0:01');
});

test('formatPlaybackTime shows sub-second positions as 0:00', () => {
  assert.equal(formatPlaybackTime(1), '0:00');
});

test('formatPlaybackTime zero-pads seconds below ten', () => {
  assert.equal(formatPlaybackTime(65_000), '1:05');
});

test('formatPlaybackTime renders the last second before a minute rollover', () => {
  assert.equal(formatPlaybackTime(59_000), '0:59');
});

test('formatPlaybackTime rolls over to the next minute at exactly 60s', () => {
  assert.equal(formatPlaybackTime(60_000), '1:00');
});

test('formatPlaybackTime counts an hour as 60 minutes rather than switching to h:mm:ss', () => {
  assert.equal(formatPlaybackTime(3_600_000), '60:00');
});

test('formatPlaybackTime keeps counting minutes past an hour', () => {
  assert.equal(formatPlaybackTime(3_723_000), '62:03');
});

test('formatPlaybackTime treats a negative position as the start of the track', () => {
  assert.equal(formatPlaybackTime(-5_000), '0:00');
});

test('formatPlaybackTime treats NaN as the start of the track', () => {
  assert.equal(formatPlaybackTime(Number.NaN), '0:00');
});

test('formatPlaybackTime treats an unknown (Infinity) duration as the start of the track', () => {
  assert.equal(formatPlaybackTime(Number.POSITIVE_INFINITY), '0:00');
});

test('formatPlaybackTime treats -Infinity as the start of the track', () => {
  assert.equal(formatPlaybackTime(Number.NEGATIVE_INFINITY), '0:00');
});
