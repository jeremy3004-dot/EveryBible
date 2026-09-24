import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPlanDetailCompactHeaderHeight,
  isPlanDetailCompactHeaderVisible,
} from './planDetailHeaderModel';

// iPhone 17 Pro geometry: 62pt top inset, the 360pt photo hero whose title
// sits 94pt above its lower edge.
const HERO = { coverHeight: 360, heroTextBottom: 94 };
const headerHeight = getPlanDetailCompactHeaderHeight(62);

test('the compact header clears the status bar and a 44pt control row', () => {
  assert.ok(headerHeight >= 62 + 44);
});

test('the compact header stays hidden while the hero title is still on screen', () => {
  assert.equal(
    isPlanDetailCompactHeaderVisible({ scrollOffsetY: 0, headerHeight, ...HERO }),
    false
  );
  assert.equal(
    isPlanDetailCompactHeaderVisible({ scrollOffsetY: 100, headerHeight, ...HERO }),
    false
  );
});

// The plan page keeps its scroll offset when the reader returns to it, so the
// ledger rows must never sit bare under the status bar with no title or back
// control: that is where the reader's own back chevron was, and a second tap
// there used to open whichever day had scrolled into the spot.
test('the compact header is showing before page content reaches the status bar', () => {
  const pageContentReachesStatusBar = HERO.coverHeight - 71 - 62;
  assert.equal(
    isPlanDetailCompactHeaderVisible({
      scrollOffsetY: pageContentReachesStatusBar,
      headerHeight,
      ...HERO,
    }),
    true
  );
  assert.equal(
    isPlanDetailCompactHeaderVisible({ scrollOffsetY: 2400, headerHeight, ...HERO }),
    true
  );
});
