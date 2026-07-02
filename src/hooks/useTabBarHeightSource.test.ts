import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('useTabBarHeight derives the bottom gutter from the device safe area instead of a fixed constant', () => {
  const source = readRelativeSource('./useTabBarHeight.ts');

  assert.match(
    source,
    /import \{ useSafeAreaInsets \} from 'react-native-safe-area-context';/,
    'useTabBarHeight should read the real device safe-area insets'
  );

  assert.match(
    source,
    /const bottomPadding = Math\.max\(insets\.bottom, spacing\.lg\);/,
    'useTabBarHeight should use whichever is larger: the real bottom inset (e.g. Android 3-button nav) or the default design gutter'
  );

  assert.match(
    source,
    /const height = layout\.tabBarBaseHeight \+ bottomPadding;/,
    'useTabBarHeight should derive the full bar height from the base token plus the safe-area-aware bottom padding'
  );

  assert.match(
    source,
    /return \{ bottomPadding, height \};/,
    'useTabBarHeight should expose both the padding and the derived height so every consumer stays in sync'
  );
});
