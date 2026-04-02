import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen uses a bounce-enabled scroll shell while sizing itself against the tab bar height', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /<ScrollView[\s\S]*bounces[\s\S]*alwaysBounceVertical[\s\S]*overScrollMode="always"/,
    'HomeScreen should wrap the fixed layout in a bounce-enabled scroll container so pull-down gestures feel responsive'
  );

  assert.equal(
    source.includes('RefreshControl'),
    false,
    'HomeScreen should not depend on pull-to-refresh once it becomes a fixed layout'
  );

  assert.match(
    source,
    /edges=\{\['top'\]\}/,
    'HomeScreen should keep the bottom edge out so the tab bar owns the bottom inset'
  );

  assert.match(
    source,
    /getHomeScreenLayout\(screenWidth, screenHeight, bottomTabBarHeight\)/,
    'HomeScreen should size itself against the visible space after the bottom bar'
  );
});

test('HomeScreen trims the bottom padding so Chapters Read clears the tab bar', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /paddingBottom:\s*Math\.max\(spacing\.sm,\s*homeLayout\.screenPadding\s*-\s*spacing\.xs\)/,
    'HomeScreen should keep a little less space under the content so the bottom card sits above the tabs'
  );

  assert.match(
    source,
    /content:\s*{[\s\S]*flexGrow:\s*1,/,
    'HomeScreen should use flexGrow on the scroll content so the fixed layout still fills the screen while allowing elastic bounce'
  );
});

test('HomeScreen removes the extra welcome subtitle so the fixed layout can sit higher', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.equal(
    source.includes("t('home.welcome')"),
    false,
    'HomeScreen should remove the extra welcome subtitle to free vertical space for the fixed layout'
  );
});

test('HomeScreen localizes the foundation continuation card instead of hardcoding English copy', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /FOUNDATION_TITLE_KEYS\[activeFoundation\.id\]/,
    'HomeScreen should resolve the active foundation title through the gather locale key map'
  );

  assert.match(
    source,
    /FOUNDATION_DESC_KEYS\[activeFoundation\.id\]/,
    'HomeScreen should resolve the active foundation description through the gather locale key map'
  );

  assert.match(
    source,
    /t\('gather\.lessonsProgress',\s*{\s*completed:\s*activeFoundationDone,\s*total:\s*activeFoundationTotal/s,
    'HomeScreen should localize the foundation lesson progress string'
  );

  assert.equal(
    source.includes('CONTINUE IN FOUNDATIONS'),
    false,
    'HomeScreen should not hardcode the continuation eyebrow in English'
  );

  assert.equal(
    source.includes('GET STARTED'),
    false,
    'HomeScreen should not hardcode the foundation CTA eyebrow in English'
  );
});
