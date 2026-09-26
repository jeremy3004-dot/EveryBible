import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCarriedReaderChromeProgress,
  getNextReaderChromeProgress,
  getSettledReaderChromeProgress,
} from './readerChromeMotion';

const scroll = (progress: number, previousOffset: number, offset: number) =>
  getNextReaderChromeProgress({
    progress,
    previousOffset,
    offset,
    viewportHeight: 900,
    contentHeight: 3000,
  });

test('reader chrome follows each small scroll update without waiting for the JS threshold', () => {
  let progress = 0;
  for (let offset = 4; offset <= 132; offset += 4) {
    progress = scroll(progress, offset - 4, offset);
    assert.ok(Math.abs(progress - offset / 132) < 0.00001);
  }
  assert.ok(Math.abs(progress - 1) < 0.00001);
});

test('reversing deep in a chapter reveals chrome continuously, then reverses again', () => {
  assert.equal(scroll(1, 1000, 967), 0.75);
  assert.equal(scroll(0.75, 967, 934), 0.5);
  assert.equal(scroll(0.5, 934, 967), 0.75);
  assert.equal(scroll(1, 1000, 800), 0);
});

test('returning to a retained chapter uses its last offset for the first small drag', () => {
  assert.equal(scroll(0, 1000, 1001), 1 / 132);
});

test('overscroll rebound cannot hide the controls at either end of a chapter', () => {
  assert.equal(scroll(0, -40, 0), 0);
  assert.equal(scroll(0, 2140, 2100), 0);
  assert.equal(scroll(1, 2067, 2100), 0);
  assert.equal(scroll(1, 33, 0), 0);
});

test('chrome rises progressively before the final verse instead of snapping at the bottom', () => {
  assert.equal(scroll(1, 1968, 2001), 0.75);
  assert.equal(scroll(0.75, 2001, 2034), 0.5);
  assert.equal(scroll(0.5, 2034, 2067), 0.25);
  assert.equal(scroll(0.25, 2067, 2100), 0);
});

test('short chapters and reduced motion keep the complete controls available', () => {
  assert.equal(
    getNextReaderChromeProgress({
      progress: 1,
      previousOffset: 0,
      offset: 20,
      viewportHeight: 900,
      contentHeight: 800,
    }),
    0
  );
  assert.equal(
    getNextReaderChromeProgress({
      progress: 1,
      previousOffset: 1000,
      offset: 1100,
      viewportHeight: 900,
      contentHeight: 3000,
      reduceMotion: true,
    }),
    0
  );
});

test('a list moving without the finger leaves the chrome where it was, hidden or shown', () => {
  const settle = (progress: number, contentHeight = 3000) =>
    getSettledReaderChromeProgress({ progress, viewportHeight: 900, contentHeight });
  assert.equal(settle(1), 1, 'the top of a new chapter does not reveal collapsed chrome');
  assert.equal(settle(0), 0, 'a jump to a focus verse does not collapse shown chrome');
  assert.equal(settle(0.4), 0.4);
  // A chapter that no longer scrolls could never be scrolled back to the chrome.
  assert.equal(settle(1, 900), 0);
  assert.equal(
    getSettledReaderChromeProgress({
      progress: 1,
      viewportHeight: 900,
      contentHeight: 3000,
      reduceMotion: true,
    }),
    0
  );
});

test('a chapter the reader steps to keeps the chrome, settling half-way states on the nearer end', () => {
  assert.equal(getCarriedReaderChromeProgress(0), 0);
  assert.equal(getCarriedReaderChromeProgress(0.3), 0);
  assert.equal(getCarriedReaderChromeProgress(0.5), 1);
  assert.equal(getCarriedReaderChromeProgress(0.85), 1);
  assert.equal(getCarriedReaderChromeProgress(1), 1);
});
