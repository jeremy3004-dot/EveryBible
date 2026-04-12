import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('TabNavigator keeps the bottom tab bar flat instead of rounding its top corners', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.equal(
    source.includes('borderTopLeftRadius'),
    false,
    'TabNavigator should not round the top-left corner of the shared bottom tab bar'
  );

  assert.equal(
    source.includes('borderTopRightRadius'),
    false,
    'TabNavigator should not round the top-right corner of the shared bottom tab bar'
  );

  assert.equal(
    source.includes('borderRadius'),
    false,
    'TabNavigator should not reintroduce a generic border radius on the shared bottom tab bar'
  );
});

test('TabNavigator collapses the tab bar when BibleReader hides it instead of hard-removing it', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /const getCollapsingTabBarStyle = \(collapseProgress: number\) => \(\{/,
    'TabNavigator should define a progress-driven tab-bar style for reader-driven hide/show motion'
  );

  assert.match(
    source,
    /position:\s*'absolute'[\s\S]*left:\s*0,[\s\S]*right:\s*0,[\s\S]*bottom:\s*0,[\s\S]*paddingBottom:\s*tabBarBottomPadding \+ spacing\.sm,[\s\S]*height:\s*tabBarHeight,[\s\S]*transform:\s*\[\{\s*translateY:\s*tabBarHeight \* collapseProgress\s*\}\],[\s\S]*opacity:\s*1 - collapseProgress/s,
    'TabNavigator should move the entire bar downward as one overlay piece so the background slab and icon row stay locked together without reserving a dead layout strip'
  );

  assert.match(
    source,
    /tabBarCollapseProgress > 0\s*\?\s*getCollapsingTabBarStyle\(tabBarCollapseProgress\)\s*:\s*defaultTabBarStyle/s,
    'TabNavigator should choose between the normal and collapsing tab-bar styles from the reader progress signal'
  );
});

test('TabNavigator freezes inactive tabs so Home, Bible, and Gather do not keep repainting off-screen', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /freezeOnBlur:\s*true/,
    'TabNavigator should freeze inactive tabs to reduce lag while switching between Home, Bible, and Gather'
  );
});

test('TabNavigator keeps the tab bar padding compact instead of turning the bottom inset into a dark strip', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.equal(
    source.includes('paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm'),
    false,
    'TabNavigator should not reserve the full bottom inset as extra internal padding'
  );

  assert.match(
    source,
    /const tabBarBottomPadding = spacing\.lg;/,
    'TabNavigator should use a visible bottom gutter to pull the icons away from the home indicator'
  );

  assert.equal(
    source.includes('paddingTop: spacing.xs'),
    false,
    'TabNavigator should not add extra padding above the tab icons because that pushes the content lower'
  );

  assert.match(
    source,
    /tabBarItemStyle:\s*\{\s*paddingBottom:\s*spacing\.xs,\s*\}/s,
    'TabNavigator should place the extra item padding below the icons so the row sits a little higher'
  );
});

test('TabNavigator reads the shared plan-session reader signal before hiding the root tabs', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /useBibleStore\(\(state\) => state\.isPlanSessionReaderActive\)/,
    'TabNavigator should subscribe to the shared plan-session reader signal so tab visibility does not depend on fragile nested route params'
  );
});

test('TabNavigator uses the base tab bar height instead of adding the bottom safe-area inset twice', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /const tabBarHeight = layout\.tabBarBaseHeight \+ tabBarBottomPadding;/,
    'TabNavigator should size the bar from the base token plus a small internal lift'
  );

  assert.equal(
    source.includes('layout.tabBarBaseHeight + insets.bottom'),
    false,
    'TabNavigator should not stack the bottom inset onto the tab bar height itself'
  );
});

test('TabNavigator blends the bar into the screen background instead of a separate card surface', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.equal(
    source.includes('backgroundColor: colors.cardBackground'),
    false,
    'TabNavigator should use the screen background so the bottom bar does not read like a dark slab'
  );
});

test('TabNavigator keeps Home in the normal tab bar instead of floating it over the screen', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /route\.name === 'Home'/,
    'TabNavigator should keep the Home tab in the standard bar configuration'
  );

  assert.equal(source.includes("backgroundColor: 'transparent'"), false);
  assert.match(
    source,
    /route\.name === 'Home'[\s\S]*return defaultTabBarStyle;/,
    'TabNavigator should keep Home on the standard tab-bar style instead of the collapsing overlay style'
  );
});

test('TabNavigator hides BibleReader only when it is launched as a plan session', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /shouldHideTabBarOnNestedRoute/,
    'TabNavigator should use the shared nested-route visibility helper'
  );

  assert.match(
    source,
    /resolveActiveNestedRoute\(/,
    'TabNavigator should resolve the active nested route (including deeper stack state) before asking the helper whether to hide the bar'
  );

  assert.match(
    source,
    /getFocusedRouteNameFromRoute\(route as never\)/,
    'TabNavigator should continue resolving the focused nested route name via React Navigation before applying tab-bar visibility rules'
  );

  assert.match(
    source,
    /fallbackNestedRouteName = route\.params\?\.screen/,
    'TabNavigator should still fall back to the root tab route params when nested state has not populated yet'
  );

  assert.match(
    source,
    /fallbackNestedRouteParams = route\.params\?\.params/,
    'TabNavigator should read nested route params from the root tab route params during early plan-reader navigation'
  );
});

test('TabNavigator resumes the last open Bible chapter when the Bible tab is pressed from a cold start', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /useBibleStore\(\(state\) => state\.hasReaderHistory\)/,
    'TabNavigator should read persisted Bible reader history before deciding where the Bible tab should open'
  );

  assert.match(
    source,
    /useBibleStore\(\(state\) => state\.currentBook\)/,
    'TabNavigator should read the last open Bible book from the shared store'
  );

  assert.match(
    source,
    /useBibleStore\(\(state\) => state\.currentChapter\)/,
    'TabNavigator should read the last open Bible chapter from the shared store'
  );

  assert.match(
    source,
    /listeners=\{\(\{ navigation, route \}\) =>/,
    'TabNavigator should attach a Bible tab-press listener so cold starts can resume into the reader stack'
  );

  assert.match(
    source,
    /navigation\.navigate\('Bible', \{\s*screen:\s*'BibleReader',\s*params:\s*\{\s*bookId:\s*currentBibleBook,\s*chapter:\s*currentBibleChapter/s,
    'TabNavigator should reopen the Bible tab at the persisted reader chapter instead of always dumping the user back into the book list'
  );
});

test('TabNavigator clears preserved plan-session reader params when the Bible tab is pressed', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /typeof nestedRouteParams\?\.planId === 'string'/,
    'TabNavigator should detect when the preserved Bible tab route is still carrying a reading-plan session'
  );

  assert.match(
    source,
    /planId:\s*undefined/,
    'TabNavigator should explicitly clear the plan session id when reopening the shared Bible tab'
  );

  assert.match(
    source,
    /planDayNumber:\s*undefined/,
    'TabNavigator should clear the active plan day number so the normal Bible reader chrome returns'
  );

  assert.match(
    source,
    /sessionContext:\s*undefined/,
    'TabNavigator should clear any preserved rhythm session context when the user chooses the Bible tab itself'
  );
});

test('TabNavigator resets the Plans tab to PlansHome when the tab is pressed directly', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /name="Plans"[\s\S]*listeners=\{\(\{ navigation \}\) =>/,
    'TabNavigator should attach a tab-press listener to the Plans tab so direct taps can reopen the plans list'
  );

  assert.match(
    source,
    /event\.preventDefault\(\);/,
    'TabNavigator should intercept direct Plans-tab presses instead of reusing the preserved nested stack state'
  );

  assert.match(
    source,
    /navigation\.navigate\('Plans', \{\s*screen:\s*'PlansHome'/s,
    'TabNavigator should send direct Plans-tab presses back to PlansHome instead of reopening the last plan detail'
  );
});
