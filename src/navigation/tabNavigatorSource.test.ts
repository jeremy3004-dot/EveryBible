import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('TabNavigator keeps the bottom tab bar flat instead of rounding its top corners', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.equal(
    source.includes('borderTopLeftRadius'),
    false,
    'TabNavigator should not round the top-left corner of the shared bottom tab bar'
  );

  assert.equal(
    source.includes('borderTopRightRadius'),
    false,
    'TabNavigator should not round the top-right corner of the shared bottom tab bar'
  );

  assert.equal(
    source.includes('borderRadius'),
    false,
    'TabNavigator should not reintroduce a generic border radius on the shared bottom tab bar'
  );
});

test('TabNavigator freezes inactive tabs so Home, Bible, and Gather do not keep repainting off-screen', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /freezeOnBlur:\s*true/,
    'TabNavigator should freeze inactive tabs to reduce lag while switching between Home, Bible, and Gather'
  );
});

test('TabNavigator keeps the tab bar padding compact instead of turning the bottom inset into a dark strip', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.equal(
    source.includes('paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm'),
    false,
    'TabNavigator should not reserve the full bottom inset as extra internal padding'
  );
});

test('TabNavigator blends the bar into the screen background instead of a separate card surface', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.equal(
    source.includes('backgroundColor: colors.cardBackground'),
    false,
    'TabNavigator should use the screen background so the bottom bar does not read like a dark slab'
  );
});

test('TabNavigator lets Home float instead of reserving a dark bar surface', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /route\.name === 'Home'/,
    'TabNavigator should treat the Home tab as the floating tab-bar case'
  );

  assert.match(
    source,
    /backgroundColor:\s*'transparent'/,
    'TabNavigator should make the Home tab bar transparent'
  );

  assert.match(
    source,
    /position:\s*'absolute'/,
    'TabNavigator should let the Home tab bar float over the screen instead of reserving a block'
  );
});
