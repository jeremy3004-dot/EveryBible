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

test('TabNavigator keeps Home in the normal tab bar instead of floating it over the screen', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /route\.name === 'Home'/,
    'TabNavigator should keep the Home tab in the standard bar configuration'
  );

  assert.equal(source.includes("backgroundColor: 'transparent'"), false);
  assert.equal(source.includes("position: 'absolute'"), false);
});
