import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPlanCoverHeight,
  getPlanDetailCompactHeaderHeight,
  isPlanDetailCompactHeaderVisible,
} from './planDetailHeaderModel';

// iPhone 17 Pro geometry: 402pt wide, 62pt top inset, the title block set 16pt
// beneath the cover plate.
const TITLE_GAP = 16;
const coverHeight = getPlanCoverHeight(402);
const titleTop = coverHeight + TITLE_GAP;
const headerHeight = getPlanDetailCompactHeaderHeight(62);

test('a phone shows the whole 4:3 cover plate', () => {
  assert.equal(getPlanCoverHeight(402), 302);
  assert.equal(getPlanCoverHeight(390), 293);
});

test('a wide window caps the cover height instead of letting the plate fill the screen', () => {
  assert.equal(getPlanCoverHeight(1024), 420);
});

test('the compact header clears the status bar and a 44pt control row', () => {
  assert.ok(headerHeight >= 62 + 44);
});

test('the compact header stays hidden while the title is still clear of it', () => {
  assert.equal(
    isPlanDetailCompactHeaderVisible({ scrollOffsetY: 0, titleTop, headerHeight }),
    false
  );
  assert.equal(
    isPlanDetailCompactHeaderVisible({ scrollOffsetY: 100, titleTop, headerHeight }),
    false
  );
});

// The plan page keeps its scroll offset when the reader returns to it, so the
// ledger rows must never sit bare under the status bar with no title or back
// control: that is where the reader's own back chevron was, and a second tap
// there used to open whichever day had scrolled into the spot. The title is the
// first page content below the cover.
test('the compact header is showing before page content reaches the status bar', () => {
  const pageContentReachesStatusBar = titleTop - 62;
  assert.equal(
    isPlanDetailCompactHeaderVisible({
      scrollOffsetY: pageContentReachesStatusBar,
      titleTop,
      headerHeight,
    }),
    true
  );
  assert.equal(
    isPlanDetailCompactHeaderVisible({ scrollOffsetY: 2400, titleTop, headerHeight }),
    true
  );
});
