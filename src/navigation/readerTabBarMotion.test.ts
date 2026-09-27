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
  getPlayerBarScrubFraction,
  getPlayerBarScrubIntent,
  getPlayerBarTabRowOpacity,
  isNearPlayerBarProgressLine,
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
  assert.equal(getPlayerBarCapsuleHeight(expanded, 'strip', 0.5), (expanded + 44) / 2);
  assert.equal(getPlayerBarCapsuleHeight(expanded, 'hide', 1), expanded, 'hiding never squashes');
  assert.equal(PLAYER_BAR_STRIP_HEIGHT, 44, 'the owner found 38pt too thin');

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

test('the tabs fade out by the strip threshold and the progress line becomes its edge', () => {
  assert.equal(getPlayerBarTabRowOpacity('strip', 0), 1);
  assert.equal(getPlayerBarTabRowOpacity('strip', 0.25), 0.5);
  assert.equal(getPlayerBarTabRowOpacity('strip', 0.5), 0);
  assert.equal(getPlayerBarTabRowOpacity('strip', 1), 0);
  assert.equal(getPlayerBarTabRowOpacity('hide', 1), 1, 'hiding slides the bar whole');

  assert.equal(getPlayerBarProgressLineTop('strip', 0), PLAYER_BAR_ROW_HEIGHT);
  assert.equal(getPlayerBarProgressLineTop('strip', 1), 42, 'the 44pt strip’s bottom 2pt');
  assert.equal(getPlayerBarProgressLineTop('hide', 1), PLAYER_BAR_ROW_HEIGHT);
});

// ---- Dragging the player bar's progress line ----------------------------------------

test('a drag may start on the progress line or within 22pt of it, a 44pt band', () => {
  // The expanded line sits at 56pt, 2pt tall: its centre is 57.
  assert.equal(isNearPlayerBarProgressLine(57, 56), true);
  assert.equal(isNearPlayerBarProgressLine(35, 56), true);
  assert.equal(isNearPlayerBarProgressLine(79, 56), true);
  assert.equal(isNearPlayerBarProgressLine(34, 56), false, 'the transport row above');
  assert.equal(isNearPlayerBarProgressLine(80, 56), false, 'the tab row below');
});

test('only a sideways drag scrubs; a tap waits and a vertical move lets go', () => {
  assert.equal(getPlayerBarScrubIntent(3, 1), 'wait', 'a tap stays with the button under it');
  assert.equal(getPlayerBarScrubIntent(10, 2), 'activate');
  assert.equal(getPlayerBarScrubIntent(-10, 3), 'activate');
  assert.equal(getPlayerBarScrubIntent(2, 14), 'fail');
  assert.equal(getPlayerBarScrubIntent(9, 9), 'wait', 'diagonal is not yet sideways');
});

test('a scrub lands on the share of the inset line under the finger, clamped to the chapter', () => {
  // A 300pt capsule insets its line 16pt a side: 268pt of line from x=16.
  assert.equal(getPlayerBarScrubFraction(16, 300), 0);
  assert.equal(getPlayerBarScrubFraction(150, 300), 0.5);
  assert.equal(getPlayerBarScrubFraction(0, 300), 0);
  assert.equal(getPlayerBarScrubFraction(400, 300), 1);
  assert.equal(getPlayerBarScrubFraction(150, 0), 0, 'unmeasured');
});
