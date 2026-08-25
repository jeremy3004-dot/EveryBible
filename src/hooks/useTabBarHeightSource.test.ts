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

  // The bar is a floating capsule, so the gutter is the gap BENEATH it. On a
  // device with a home indicator the capsule tucks into the safe area (the
  // indicator is a hairline); without one it falls back to the design gutter.
  assert.match(
    source,
    /const bottomPadding = insets\.bottom > 0 \? 21 : spacing\.lg;/,
    'useTabBarHeight should derive the capsule gap from the real bottom inset, not a fixed constant'
  );

  // `height` must stay "space content has to clear" — every docked surface
  // (reader transport, audio return tab, settings scroll) depends on that.
  assert.match(
    source,
    /height: bottomPadding \+ TAB_BAR_CAPSULE_HEIGHT,/,
    'height should remain the total space the tab bar occupies, so docked content still clears it'
  );

  assert.match(
    source,
    /barHeight: TAB_BAR_CAPSULE_HEIGHT,/,
    'the capsule height should be exposed separately from the occupied space'
  );
});
