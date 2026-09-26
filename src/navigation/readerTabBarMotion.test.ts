import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getPlayerBarCapsuleHeight,
  getPlayerBarCollapseMode,
  getPlayerBarHideTranslation,
  getPlayerBarPhase,
  getPlayerBarProgress,
  getPlayerBarProgressLineTop,
  getPlayerBarRowOpacities,
  getReaderTabBarTranslation,
  isReaderTabBarScrollHidden,
  PLAYER_BAR_ROW_HEIGHT,
  PLAYER_BAR_SECTION_HEIGHT,
  PLAYER_BAR_STRIP_HEIGHT,
  shouldFollowReaderScroll,
} from './readerTabBarMotion';
import { buildTabBarCapsuleStyle, TAB_BAR_CAPSULE_ROW_INSET } from './tabBarCapsuleStyle';

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
    // Transparent: the material comes from the tab bar background component.
    assert.equal(style.backgroundColor, 'transparent');
    // 6pt of paper around the row, which is what leaves a 52pt pill in a 64pt capsule.
    assert.equal(style.paddingHorizontal, TAB_BAR_CAPSULE_ROW_INSET);
  }
  assert.equal(TAB_BAR_CAPSULE_ROW_INSET, 6);
});

// Dependency contract guard: reads the installed BottomTabBar's logical-edge defaults.
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

// ---- The fused player bar ---------------------------------------------------

test('the bar collapses with the reader only while it follows it, clamped to 0..1', () => {
  assert.equal(getPlayerBarProgress(true, 0.4), 0.4);
  assert.equal(getPlayerBarProgress(true, 3), 1);
  assert.equal(getPlayerBarProgress(true, -1), 0);
  assert.equal(getPlayerBarProgress(false, 1), 0, 'another tab never collapses');
});

test('with audio loaded the bar shrinks into the strip; otherwise it slides away whole', () => {
  const expanded = PLAYER_BAR_SECTION_HEIGHT + 64;
  assert.equal(getPlayerBarCollapseMode(true, true), 'strip');
  assert.equal(getPlayerBarCollapseMode(true, false), 'hide');
  assert.equal(getPlayerBarCollapseMode(false, true), 'hide', 'no player row, nothing to keep');

  assert.equal(getPlayerBarCapsuleHeight(expanded, 'strip', 0), expanded);
  assert.equal(getPlayerBarCapsuleHeight(expanded, 'strip', 1), PLAYER_BAR_STRIP_HEIGHT);
  assert.equal(getPlayerBarCapsuleHeight(expanded, 'strip', 0.5), (expanded + 38) / 2);
  assert.equal(getPlayerBarCapsuleHeight(expanded, 'hide', 1), expanded, 'hiding never squashes');
  assert.equal(PLAYER_BAR_STRIP_HEIGHT, 38);

  assert.equal(getPlayerBarHideTranslation('strip', 1, expanded, 22), 0);
  assert.equal(getPlayerBarHideTranslation('hide', 0, expanded, 22), 0);
  // Its own height and the gap beneath it, so nothing of the capsule stays on screen.
  assert.ok(getPlayerBarHideTranslation('hide', 1, expanded, 22) > expanded + 22);
});

test('only the phase boundary is JS-visible: strip past half way, hidden at the end', () => {
  assert.equal(getPlayerBarPhase('strip', 0.49), 'expanded');
  assert.equal(getPlayerBarPhase('strip', 0.5), 'strip');
  assert.equal(getPlayerBarPhase('strip', 1), 'strip');
  assert.equal(getPlayerBarPhase('hide', 0.97), 'expanded');
  assert.equal(getPlayerBarPhase('hide', 0.98), 'hidden');
});

test('the rows cross-fade through the strip threshold and the progress line becomes its edge', () => {
  assert.deepEqual(getPlayerBarRowOpacities('strip', 0), { expanded: 1, strip: 0 });
  assert.deepEqual(getPlayerBarRowOpacities('strip', 0.5), { expanded: 0, strip: 0 });
  assert.deepEqual(getPlayerBarRowOpacities('strip', 1), { expanded: 0, strip: 1 });
  assert.deepEqual(getPlayerBarRowOpacities('hide', 1), { expanded: 1, strip: 0 });

  assert.equal(getPlayerBarProgressLineTop('strip', 0), PLAYER_BAR_ROW_HEIGHT);
  assert.equal(getPlayerBarProgressLineTop('strip', 1), 36, 'the 38pt strip’s bottom 2pt');
  assert.equal(getPlayerBarProgressLineTop('hide', 1), PLAYER_BAR_ROW_HEIGHT);
});
