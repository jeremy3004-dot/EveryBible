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
    /onStateChange=\{\(\) => \{[\s\S]*?setCurrentRouteName\(routeState\.name\);[\s\S]*?setCurrentRouteParams\(routeState\.params\);[\s\S]*?\}\}/,
    'RootNavigator should update current route name and params when navigation state changes'
  );

  assert.match(
    rootNavigatorSource,
    /<MiniPlayerHost currentRouteName=\{currentRouteName\} currentRouteParams=\{currentRouteParams\} \/>/,
    'RootNavigator should pass both current route name and params into the mini player host'
  );
});

test('mini player is not globally hidden on BibleReader when audio may still be active from another chapter', () => {
  const miniPlayerSource = readRelativeSource('./MiniPlayer.tsx');

  assert.equal(
    /if \(!book \|\| !displayChapter \|\| currentRouteName === 'BibleReader'\)/.test(miniPlayerSource),
    false,
    'MiniPlayer should not disappear for every BibleReader route because users need a visible pause surface when old chapter audio is still playing in the background'
  );

  assert.match(
    miniPlayerSource,
    /const isViewingActiveAudioChapter =[\s\S]*?currentRouteName === 'BibleReader'[\s\S]*?routeBookId === displayBookId[\s\S]*?routeChapter === displayChapter;/,
    'MiniPlayer should hide itself only when the reader is already showing the active audio chapter'
  );
});
