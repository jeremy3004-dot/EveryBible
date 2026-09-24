import assert from 'node:assert/strict';
import test from 'node:test';
import { FONT_SIZE_SCALES } from '../../constants/fontSizeScales';
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

test('the hero verse follows the in-app reading size and keeps the design size at medium', () => {
  const size = (fontSize: keyof typeof FONT_SIZE_SCALES) =>
    getHomeScreenLayout(
      HOME_SCREEN_BASE_WIDTH,
      HOME_SCREEN_BASE_HEIGHT,
      0,
      FONT_SIZE_SCALES[fontSize]
    );

  assert.deepEqual(
    [size('medium').verseTextFontSize, size('medium').verseTextLineHeight],
    [28, 36],
    'medium is the reference design: 28/36 on the 390x844 frame'
  );
  assert.deepEqual([size('large').verseTextFontSize, size('large').verseTextLineHeight], [34, 43]);
  assert.deepEqual([size('small').verseTextFontSize, size('small').verseTextLineHeight], [24, 31]);
});

test('the reading size grows the verse, not the photograph it sits on', () => {
  const medium = getHomeScreenLayout(390, 844, 88, FONT_SIZE_SCALES.medium);
  const large = getHomeScreenLayout(390, 844, 88, FONT_SIZE_SCALES.large);

  // The photograph height is only the hero's minimum; HomeScreen lets a longer
  // or larger verse push the hero taller rather than truncating the scripture.
  assert.equal(large.heroPhotoHeight, medium.heroPhotoHeight);
  assert.equal(large.greetingFontSize, medium.greetingFontSize);
  assert.ok(large.verseTextFontSize > medium.verseTextFontSize);
});
