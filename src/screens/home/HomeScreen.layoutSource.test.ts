import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen stays fixed and sizes itself against the tab bar height', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.equal(
    source.includes('ScrollView'),
    false,
    'HomeScreen should not use a scroll container now that the layout is fixed to the screen'
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
});
