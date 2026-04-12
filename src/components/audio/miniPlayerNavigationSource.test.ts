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

test('root navigator no longer mounts the retired global mini player', () => {
  const rootNavigatorSource = readRelativeSource('../../navigation/RootNavigator.tsx');

  assert.equal(
    rootNavigatorSource.includes('MiniPlayerHost'),
    false,
    'RootNavigator should not keep a global mini-player host once the persistent play bar is retired'
  );

  assert.equal(
    rootNavigatorSource.includes("require('../components/audio/MiniPlayer')"),
    false,
    'RootNavigator should not lazy-load the retired global mini player either'
  );
});

test('mini player is hidden on all BibleReader routes so it never blocks reading content', () => {
  const miniPlayerSource = readRelativeSource('./MiniPlayer.tsx');

  assert.match(
    miniPlayerSource,
    /const isOnBibleReader = currentRouteName === 'BibleReader';/,
    'MiniPlayer should derive an isOnBibleReader flag from the current route name'
  );

  assert.match(
    miniPlayerSource,
    /if \(!book \|\| !displayChapter \|\| isOnBibleReader\)/,
    'MiniPlayer should return null whenever the user is on any BibleReader route'
  );
});
