import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('mini player does not read navigation state with a screen-only hook', () => {
  const miniPlayerSource = readRelativeSource('./MiniPlayer.tsx');

  assert.equal(
    miniPlayerSource.includes("useNavigationState"),
    false,
    'MiniPlayer should not use useNavigationState because it is mounted outside navigator screens'
  );

  assert.equal(
    miniPlayerSource.includes('useBottomTabBarHeight'),
    false,
    'MiniPlayer should not use useBottomTabBarHeight because it is mounted outside the bottom tab screens'
  );

  assert.match(
    miniPlayerSource,
    /const tabBarHeight = layout\.tabBarBaseHeight;/,
    'MiniPlayer should anchor itself with the shared tab bar height token instead of a screen hook'
  );
});

test('root navigator owns the current route name for the global mini player', () => {
  const rootNavigatorSource = readRelativeSource('../../navigation/RootNavigator.tsx');

  assert.match(
    rootNavigatorSource,
    /onStateChange=\{\(\) => setCurrentRouteName\(getCurrentRouteName\(\)\)\}/,
    'RootNavigator should update currentRouteName when navigation state changes'
  );

  assert.match(
    rootNavigatorSource,
    /<MiniPlayerHost currentRouteName=\{currentRouteName\} \/>/,
    'RootNavigator should pass the current route name into the mini player host'
  );
});
