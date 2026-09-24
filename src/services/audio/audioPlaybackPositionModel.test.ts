import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSeekPosition,
  interpolatePlaybackPosition,
  resolveSnapshotProgress,
  skipTargetPosition,
} from './audioPlaybackPositionModel';

test('a playing snapshot is authoritative and may move the position backward', () => {
  assert.deepEqual(
    resolveSnapshotProgress(
      { positionMs: 12_400, durationMs: 60_000 },
      { isPlaying: true, positionMillis: 12_000, durationMillis: 60_000 }
    ),
    { positionMs: 12_000, durationMs: 60_000 }
  );
});

test('a stopped snapshot never drags the position backward', () => {
  assert.deepEqual(
    resolveSnapshotProgress(
      { positionMs: 30_000, durationMs: 60_000 },
      { isPlaying: false, positionMillis: 0, durationMillis: 60_000 }
    ),
    { positionMs: 30_000, durationMs: 60_000 }
  );
});

test('a playing snapshot at zero is treated like a stop-like snapshot', () => {
  assert.equal(
    resolveSnapshotProgress(
      { positionMs: 5_000, durationMs: 60_000 },
      { isPlaying: true, positionMillis: 0, durationMillis: 60_000 }
    ).positionMs,
    5_000
  );
});

test('the duration only grows and survives a snapshot without one', () => {
  assert.equal(
    resolveSnapshotProgress(
      { positionMs: 0, durationMs: 60_000 },
      { isPlaying: true, positionMillis: 100, durationMillis: 0 }
    ).durationMs,
    60_000
  );
  assert.equal(
    resolveSnapshotProgress(
      { positionMs: 0, durationMs: 60_000 },
      { isPlaying: true, positionMillis: 100, durationMillis: 59_000 }
    ).durationMs,
    60_000
  );
  assert.equal(
    resolveSnapshotProgress(
      { positionMs: 0, durationMs: 60_000 },
      { isPlaying: true, positionMillis: 100, durationMillis: 61_000 }
    ).durationMs,
    61_000
  );
});

const interpolation = {
  anchorPositionMs: 10_000,
  anchorTimeMs: 1_000,
  nowMs: 1_200,
  playbackRate: 1,
  currentPositionMs: 10_000,
  durationMs: 60_000,
  maxElapsedMs: 250,
};

test('interpolation advances from the anchor at the playback rate', () => {
  assert.equal(interpolatePlaybackPosition(interpolation), 10_200);
  assert.equal(interpolatePlaybackPosition({ ...interpolation, playbackRate: 1.5 }), 10_300);
});

test('interpolation covers at most one interval after a stalled poll', () => {
  assert.equal(interpolatePlaybackPosition({ ...interpolation, nowMs: 60_000 }), 10_250);
});

test('interpolation stops at the end of the chapter', () => {
  assert.equal(
    interpolatePlaybackPosition({ ...interpolation, anchorPositionMs: 59_900, durationMs: 60_000 }),
    60_000
  );
});

test('interpolation without a known duration is not capped', () => {
  assert.equal(
    interpolatePlaybackPosition({ ...interpolation, anchorPositionMs: 70_000, durationMs: 0 }),
    70_200
  );
});

test('interpolation never moves the shown position backward', () => {
  assert.equal(
    interpolatePlaybackPosition({ ...interpolation, currentPositionMs: 20_000 }),
    20_000
  );
});

test('a seek is kept within the chapter', () => {
  assert.equal(clampSeekPosition(90_000, 60_000), 60_000);
  assert.equal(clampSeekPosition(-5, 60_000), 0);
  assert.equal(clampSeekPosition(30_000, 60_000), 30_000);
});

test('a seek with an unknown duration only clamps at the start', () => {
  assert.equal(clampSeekPosition(90_000, 0), 90_000);
  assert.equal(clampSeekPosition(-1, 0), 0);
});

test('a skip lands within the chapter', () => {
  assert.equal(skipTargetPosition(5_000, -10_000, 60_000), 0);
  assert.equal(skipTargetPosition(55_000, 10_000, 60_000), 60_000);
  assert.equal(skipTargetPosition(30_000, 10_000, 60_000), 40_000);
});
