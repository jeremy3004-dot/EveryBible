// Source checks, kept deliberately. The app shell renders TabNavigator at boot,
// so what it imports statically is startup cost that no render can observe: a
// render loads the same modules either way. The last test is a cross-file
// duplication guard over BibleReaderScreen, which this suite does not render.
// Behaviour (tab presses, visibility, tints, material, labels, icons) is covered
// by TabNavigator.render.test.tsx and TabBarSelection.render.test.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('TabNavigator keeps the Bible store off the root tab render path', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.doesNotMatch(
    source,
    /import \{ useBibleStore \} from '\.\.\/stores\/bibleStore';/,
    'TabNavigator should not eagerly import the Bible store while rendering the app shell'
  );

  assert.match(
    source,
    /function getBibleTabResumeState\(\)[\s\S]*require\('\.\.\/stores\/bibleStore'\)/,
    'TabNavigator should load the Bible store only when Bible-tab resume state is needed'
  );
});

test('TabNavigator imports useTabBarHeight directly, not through the hooks barrel', () => {
  const source = readRelativeSource('./TabNavigator.tsx');

  assert.match(
    source,
    /import \{ useTabBarHeight, TAB_BAR_CAPSULE_RADIUS \} from '\.\.\/hooks\/useTabBarHeight';/,
    'importing the hooks barrel would evaluate every hook module at boot'
  );
});

test('the tab bar capsule geometry is defined in exactly one place', () => {
  // TabNavigator and BibleReaderScreen both set the root tab bar's style. They
  // used to carry separate copies, so the bar changed shape when entering or
  // leaving the reader. Both must go through the shared builder.
  for (const [file, source] of [
    ['TabNavigator.tsx', readRelativeSource('./TabNavigator.tsx')],
    [
      'BibleReaderScreen.tsx',
      readFileSync(
        fileURLToPath(new URL('../screens/bible/BibleReaderScreen.tsx', import.meta.url).href),
        'utf8'
      ),
    ],
  ] as const) {
    assert.match(
      source,
      /buildTabBarCapsuleStyle\(/,
      `${file} must build the root tab bar from the shared capsule style`
    );
    assert.doesNotMatch(
      source,
      /borderTopWidth: 1,[\s\S]{0,200}?left: 0,[\s\S]{0,200}?right: 0,[\s\S]{0,200}?bottom: 0,/,
      `${file} must not re-inline a full-width, flush-to-bottom tab bar`
    );
  }
});
