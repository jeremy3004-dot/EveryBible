import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOME_SCREEN_BASE_HEIGHT,
  HOME_SCREEN_BASE_WIDTH,
  HOME_STATS_COMPACT_LAYOUT_WIDTH,
  getHomeScreenLayout,
  getHomeScreenScale,
  shouldUseCompactHomeStatsLayout,
} from './homeLayoutModel';

test('home stats layout switches to compact mode on narrow screens', () => {
  assert.equal(shouldUseCompactHomeStatsLayout(HOME_STATS_COMPACT_LAYOUT_WIDTH - 1), true);
  assert.equal(shouldUseCompactHomeStatsLayout(HOME_STATS_COMPACT_LAYOUT_WIDTH), false);
  assert.equal(shouldUseCompactHomeStatsLayout(430), false);
});

test('home screen layout scales down on short phones and up on large phones', () => {
  assert.equal(getHomeScreenScale(HOME_SCREEN_BASE_WIDTH, HOME_SCREEN_BASE_HEIGHT), 1);

  const compact = getHomeScreenLayout(320, 568);
  const standard = getHomeScreenLayout(HOME_SCREEN_BASE_WIDTH, HOME_SCREEN_BASE_HEIGHT);
  const large = getHomeScreenLayout(430, 932);

  assert.ok(compact.scale < standard.scale);
  assert.ok(compact.screenPadding < standard.screenPadding);
  assert.ok(compact.verseCardMinHeight < standard.verseCardMinHeight);
  assert.ok(compact.greetingFontSize < standard.greetingFontSize);
  assert.equal(compact.foundationTitleLines, 1);
  assert.equal(standard.foundationTitleLines, 2);
  assert.ok(compact.verseTextLines < standard.verseTextLines);

  assert.ok(large.scale > standard.scale);
  assert.ok(large.sectionGap >= standard.sectionGap);
  assert.ok(large.verseCardMinHeight >= standard.verseCardMinHeight);
});

test('home screen layout tightens when bottom chrome takes space away from the content area', () => {
  const getLayoutWithChrome = getHomeScreenLayout as (
    screenWidth: number,
    screenHeight: number,
    bottomChromeHeight: number
  ) => ReturnType<typeof getHomeScreenLayout>;

  const standard = getHomeScreenLayout(390, 844);
  const withChrome = getLayoutWithChrome(390, 844, 88);

  assert.ok(withChrome.scale < standard.scale);
  assert.ok(withChrome.verseCardMinHeight < standard.verseCardMinHeight);
  assert.ok(withChrome.greetingFontSize < standard.greetingFontSize);
});
