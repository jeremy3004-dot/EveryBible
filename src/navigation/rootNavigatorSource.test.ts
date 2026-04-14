import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('RootNavigator keeps the current nested route name synced so global audio chrome can hide on BibleReader', () => {
  const source = readRelativeSource('./RootNavigator.tsx');

  assert.match(
    source,
    /import\s*\{\s*getCurrentRouteName\s*\}\s*from '\.\.\/components\/audio\/miniPlayerModel';/,
    'RootNavigator should reuse the shared nested-route helper instead of guessing the active route'
  );

  assert.match(
    source,
    /const \[currentRouteName, setCurrentRouteName\] = useState<string \| null>\(null\);/,
    'RootNavigator should track the current route name for global audio chrome'
  );

  assert.match(
    source,
    /onReady=\{syncCurrentRouteName\}[\s\S]*onStateChange=\{syncCurrentRouteName\}/s,
    'RootNavigator should refresh the current route on both initial ready and later navigation changes'
  );
});

test('RootNavigator mounts the new AudioReturnTab instead of reviving the retired mini player', () => {
  const source = readRelativeSource('./RootNavigator.tsx');

  assert.match(
    source,
    /import\s*\{\s*AudioReturnTab\s*\}\s*from '\.\.\/components\/audio\/AudioReturnTab';/,
    'RootNavigator should mount the dedicated audio return tab host'
  );

  assert.match(
    source,
    /<AudioReturnTab currentRouteName=\{currentRouteName\} \/>/,
    'RootNavigator should render the return tab with the tracked current route name'
  );
});
