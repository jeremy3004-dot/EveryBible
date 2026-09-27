import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCarriedReaderChromeProgress,
  getNextReaderChromeTarget,
  getSettledReaderChromeProgress,
  READER_CHROME_SNAP_TRAVEL,
} from './readerChromeMotion';

// A 3000pt chapter in a 900pt viewport scrolls 2100pt.
const scroll = (target: 0 | 1, travel: number, previousOffset: number, offset: number) =>
  getNextReaderChromeTarget({
    target,
    travel,
    previousOffset,
    offset,
    viewportHeight: 900,
    contentHeight: 3000,
  });

/** Drag from `from` to `to` in 2pt frames, as a slow finger reports it. */
function drag(target: 0 | 1, from: number, to: number) {
  let state = { target, travel: 0 };
  const step = to > from ? 2 : -2;
  for (let offset = from; offset !== to; offset += step) {
    state = scroll(state.target, state.travel, offset, offset + step);
  }
  return state;
}

// The owner wants the bar gone on the slightest scroll down, not dragged out over 132pt.
test('a slight scroll down drops the chrome all the way, even a slow one', () => {
  assert.equal(READER_CHROME_SNAP_TRAVEL, 8);
  assert.equal(drag(0, 1000, 1006).target, 0, 'under the threshold nothing moves yet');
  assert.equal(drag(0, 1000, 1008).target, 1, 'eight points down and it is gone');
  assert.equal(scroll(0, 0, 1000, 1040).target, 1, 'a fast frame does it at once');
});

test('a slight scroll up brings it back, and each reversal starts the count again', () => {
  assert.equal(drag(1, 1000, 994).target, 1);
  assert.equal(drag(1, 1000, 992).target, 0);
  // Down 6 then up 6: neither direction travelled far enough to change it.
  const down = drag(0, 1000, 1006);
  let state = down;
  for (let offset = 1006; offset !== 1000; offset -= 2) {
    state = scroll(state.target, state.travel, offset, offset - 2);
  }
  assert.equal(state.target, 0);
  assert.equal(state.travel, -6);
});

test('at the top and near the end of a chapter the controls stay up', () => {
  assert.equal(scroll(0, 0, 0, 14).target, 0, 'the first 16pt keep the bar');
  assert.equal(scroll(1, 20, 40, 10).target, 0, 'back at the top it returns');
  assert.equal(scroll(1, 20, 1990, 2010).target, 0, 'the last 96pt show the next-chapter controls');
  assert.equal(scroll(0, 0, 1900, 1990).target, 1, 'before that it still drops');
});

test('overscroll rebound cannot hide the controls at either end of a chapter', () => {
  assert.equal(scroll(0, 0, -40, 0).target, 0);
  assert.equal(scroll(0, 0, 2140, 2100).target, 0);
});

test('short chapters and reduced motion keep the complete controls available', () => {
  assert.equal(
    getNextReaderChromeTarget({
      target: 1,
      travel: 0,
      previousOffset: 0,
      offset: 20,
      viewportHeight: 900,
      contentHeight: 800,
    }).target,
    0
  );
  assert.equal(
    getNextReaderChromeTarget({
      target: 1,
      travel: 0,
      previousOffset: 1000,
      offset: 1100,
      viewportHeight: 900,
      contentHeight: 3000,
      reduceMotion: true,
    }).target,
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
