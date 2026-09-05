import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getReaderTabBarTranslation,
  isReaderTabBarScrollHidden,
  shouldFollowReaderScroll,
} from './readerTabBarMotion';
import { buildTabBarCapsuleStyle } from './tabBarCapsuleStyle';

test('reader tabs follow continuous progress without a binary jump', () => {
  assert.equal(getReaderTabBarTranslation(0), 0);
  assert.equal(getReaderTabBarTranslation(0.25), 33);
  assert.equal(getReaderTabBarTranslation(0.5), 66);
  assert.equal(getReaderTabBarTranslation(1), 132);
  assert.equal(getReaderTabBarTranslation(-1), 0);
  assert.equal(getReaderTabBarTranslation(2), 132);
});

test('reader scroll cannot move another tab or a Bible picker', () => {
  assert.equal(shouldFollowReaderScroll('Bible', 'BibleReader'), true);
  for (const tab of ['Home', 'Learn', 'Plans', 'More']) {
    assert.equal(shouldFollowReaderScroll(tab, 'BibleReader'), false);
  }
  assert.equal(shouldFollowReaderScroll('Bible', 'BibleBrowser'), false);
  assert.equal(shouldFollowReaderScroll('Bible', 'BiblePicker'), false);
});

test('explicit route collapse owns its transform without applying scroll twice', () => {
  for (const params of [
    { tabBarVisible: false },
    { planId: 'plan-1' },
    { tabBarCollapseProgress: 0.5 },
    { tabBarCollapseProgress: 1 },
  ]) {
    assert.equal(shouldFollowReaderScroll('Bible', 'BibleReader', params), false);
  }
  assert.equal(
    shouldFollowReaderScroll('Bible', 'BibleReader', { tabBarCollapseProgress: 0 }),
    true
  );
});

test('capsule keeps reference geometry and native glass alpha during explicit collapse', () => {
  for (const progress of [0, 0.5, 1]) {
    const style = buildTabBarCapsuleStyle({
      sideInset: 21,
      bottomPadding: 22,
      barHeight: 60,
      collapseProgress: progress,
    });
    assert.equal(style.start, 21);
    assert.equal(style.end, 21);
    assert.equal(style.height, 60);
    assert.equal(style.bottom, 22);
    assert.equal(style.opacity, undefined);
    assert.deepEqual(style.transform, [{ translateY: progress * 132 }]);
  }
});

test('capsule overrides React Navigation logical edges in both layout directions', () => {
  const navigationSource = readFileSync(
    fileURLToPath(
      new URL(
        '../../node_modules/@react-navigation/bottom-tabs/src/views/BottomTabBar.tsx',
        import.meta.url
      ).href
    ),
    'utf8'
  );
  const defaults = navigationSource.match(/bottom:\s*\{\s*start:\s*(\d+),\s*end:\s*(\d+),/);
  assert.ok(defaults, 'read logical edge defaults from the installed BottomTabBar');
  const mergedStyle = {
    start: Number(defaults[1]),
    end: Number(defaults[2]),
    ...buildTabBarCapsuleStyle({ sideInset: 21, bottomPadding: 22, barHeight: 60 }),
  };
  for (const rtl of [false, true]) {
    const left = rtl ? mergedStyle.end : mergedStyle.start;
    const right = rtl ? mergedStyle.start : mergedStyle.end;
    assert.equal(left, 21);
    assert.equal(right, 21);
    assert.equal(440 - Number(left) - Number(right), 398);
  }
});

test('hidden accessibility state only applies at the active reader collapse endpoint', () => {
  assert.equal(isReaderTabBarScrollHidden(true, 0), false);
  assert.equal(isReaderTabBarScrollHidden(true, 0.97), false);
  assert.equal(isReaderTabBarScrollHidden(true, 0.98), true);
  assert.equal(isReaderTabBarScrollHidden(true, 1), true);
  assert.equal(isReaderTabBarScrollHidden(true, 0.9), false);
  assert.equal(isReaderTabBarScrollHidden(false, 1), false);
});
