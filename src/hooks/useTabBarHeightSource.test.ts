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
    /const bottomPadding =\s*Platform\.OS === 'android'\s*\? Math\.max\(insets\.bottom, spacing\.lg\)\s*: insets\.bottom > 0\s*\? 22\s*: spacing\.lg;/,
    'useTabBarHeight should derive the capsule gap from the real bottom inset, not a fixed constant'
  );

  // 22pt is tuned to the iOS home indicator hairline. Android's bottom inset is
  // a 24-48dp navigation bar, so the capsule has to clear the whole thing.
  assert.match(
    source,
    /Platform\.OS === 'android'/,
    'useTabBarHeight should treat the Android navigation-bar inset differently from the iOS home indicator'
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

test('the capsule carries the EL geometry: 64pt tall, 16pt side inset, radius 32', () => {
  const source = readRelativeSource('./useTabBarHeight.ts');

  assert.match(source, /export const TAB_BAR_CAPSULE_HEIGHT = 64;/);
  assert.match(source, /export const TAB_BAR_CAPSULE_SIDE_INSET = 16;/);
  assert.match(
    source,
    /export const TAB_BAR_CAPSULE_RADIUS = TAB_BAR_CAPSULE_HEIGHT \/ 2;/,
    'a 64pt capsule is fully rounded at radius 32'
  );
});

test('contentClearance leaves scrolling screens a gap above the capsule', () => {
  const source = readRelativeSource('./useTabBarHeight.ts');

  // 22 (home-indicator gap) + 64 (capsule) + 16 (breathing room) = 102pt, so a
  // screen's last row still ends clear of the floating bar.
  assert.match(source, /export const TAB_BAR_CONTENT_GAP = spacing\.lg;/);
  assert.match(
    source,
    /contentClearance: bottomPadding \+ TAB_BAR_CAPSULE_HEIGHT \+ TAB_BAR_CONTENT_GAP,/,
    'screens should get a single number to pad their scroll content with'
  );
});
