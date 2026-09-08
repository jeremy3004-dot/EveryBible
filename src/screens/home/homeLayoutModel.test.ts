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

test('the home layout model only exposes the values HomeScreen actually renders', () => {
  assert.deepEqual(
    Object.keys(getHomeScreenLayout(HOME_SCREEN_BASE_WIDTH, HOME_SCREEN_BASE_HEIGHT)).sort(),
    [
      'greetingFontSize',
      'greetingLineHeight',
      'heroPhotoHeight',
      'verseTextFontSize',
      'verseTextLineHeight',
      'verseTextLines',
    ]
  );
});

test('home screen layout scales down on short phones and up on large phones', () => {
  assert.equal(getHomeScreenScale(HOME_SCREEN_BASE_WIDTH, HOME_SCREEN_BASE_HEIGHT), 1);

  const compact = getHomeScreenLayout(320, 568);
  const standard = getHomeScreenLayout(HOME_SCREEN_BASE_WIDTH, HOME_SCREEN_BASE_HEIGHT);
  const large = getHomeScreenLayout(430, 932);

  assert.ok(getHomeScreenScale(320, 568) < getHomeScreenScale(390, 844));
  assert.ok(compact.heroPhotoHeight < standard.heroPhotoHeight);
  assert.equal(compact.greetingFontSize, 18);
  assert.equal(standard.greetingFontSize, 22);
  assert.ok(compact.greetingLineHeight < standard.greetingLineHeight);
  assert.ok(compact.verseTextFontSize < standard.verseTextFontSize);
  assert.ok(compact.verseTextLineHeight < standard.verseTextLineHeight);
  assert.equal(compact.verseTextLines, 3);
  assert.equal(standard.verseTextLines, 4);

  assert.ok(getHomeScreenScale(430, 932) > getHomeScreenScale(390, 844));
  assert.ok(large.heroPhotoHeight >= standard.heroPhotoHeight);
  assert.ok(large.verseTextFontSize >= standard.verseTextFontSize);
});

test('home screen layout tightens when bottom chrome takes space away from the content area', () => {
  const getLayoutWithChrome = getHomeScreenLayout as (
    screenWidth: number,
    screenHeight: number,
    bottomChromeHeight: number
  ) => ReturnType<typeof getHomeScreenLayout>;

  const standard = getHomeScreenLayout(390, 844);
  const withChrome = getLayoutWithChrome(390, 844, 88);

  assert.ok(withChrome.heroPhotoHeight < standard.heroPhotoHeight);
  assert.ok(withChrome.greetingFontSize < standard.greetingFontSize);
});
