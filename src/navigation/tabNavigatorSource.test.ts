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
});

test('TabNavigator does not depend on a shared reader tab-bar store flag', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.equal(
    source.includes('readerTabBarVisible'),
    false,
    'TabNavigator should not depend on a shared readerTabBarVisible store flag now that BibleReader controls the tab bar through route params'
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
  assert.equal(source.includes("position: 'absolute'"), false);
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
    /getFocusedRouteNameFromRoute\(route\)/,
    'TabNavigator should resolve the nested route before asking the helper whether to hide the bar'
  );

  assert.match(
    source,
    /params\?\.screen/,
    'TabNavigator should also fall back to the root tab route params when nested state has not populated yet'
  );

  assert.match(
    source,
    /params\?\.params/,
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
