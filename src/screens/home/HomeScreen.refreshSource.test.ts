import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen refreshes the verse of the day on foreground and at midnight', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /AppState,[\s\S]*type AppStateStatus/,
    'HomeScreen should listen for app foreground changes'
  );

  assert.match(
    source,
    /const appStateRef = useRef<AppStateStatus>\(AppState\.currentState\);/,
    'HomeScreen should track the current app state'
  );

  assert.match(
    source,
    /getMillisecondsUntilNextLocalMidnight\(/,
    'HomeScreen should schedule a refresh for the next local midnight'
  );

  assert.match(
    source,
    /AppState\.addEventListener\('change', \(nextAppState: AppStateStatus\) => \{/,
    'HomeScreen should refresh the verse when the app returns to the foreground'
  );

  assert.match(
    source,
    /midnightRefreshTimerRef\.current = setTimeout\(\(\) => \{/,
    'HomeScreen should create a midnight refresh timer'
  );

  assert.match(
    source,
    /clearTimeout\(midnightRefreshTimerRef\.current\);/,
    'HomeScreen should clear the midnight timer during cleanup'
  );
});
