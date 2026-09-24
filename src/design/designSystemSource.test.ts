import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TextStyle } from 'react-native';
import { mockReactNative } from '../testing/mockModules';

// The EL token values screens build against, read from the real design/system module
// (react-native is stubbed because it reads Platform at import time). These are locked
// here so a stray edit to one number cannot silently retune the whole app.
mockReactNative(mock, { os: 'ios' });

type SystemModule = typeof import('./system');
type FontsModule = typeof import('./fonts');
let system: SystemModule;
let fonts: FontsModule;

before(async () => {
  system = await import('./system');
  fonts = await import('./fonts');
});

const token = (name: string): TextStyle => {
  const style = (system.typography as unknown as Record<string, TextStyle>)[name];
  assert.ok(style, `typography.${name} should exist in the shared design system`);
  return style;
};

test('the app defines a shared professional design system module', () => {
  for (const name of ['spacing', 'radius', 'typography', 'shadows'] as const) {
    assert.equal(typeof system[name], 'object', `design system should export ${name}`);
  }
});

// Codebase-wide static lint (not a behaviour test): the high-traffic screens import the
// shared design system.
const readRelativeSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');

test('high-traffic app surfaces consume the shared design system', () => {
  const files = [
    '../screens/home/HomeScreen.tsx',
    '../screens/bible/BibleBrowserScreen.tsx',
    '../screens/bible/ChapterSelectorScreen.tsx',
    '../screens/more/MoreScreen.tsx',
    '../screens/more/ProfileScreen.tsx',
    '../screens/more/ReadingActivityScreen.tsx',
    '../navigation/TabNavigator.tsx',
    '../navigation/RootNavigator.tsx',
  ];

  for (const relativePath of files) {
    const source = readRelativeSource(relativePath);

    assert.equal(
      /design\/system/.test(source),
      true,
      `${relativePath} should import the shared design system`
    );
  }
});

test('reading headings use the Lora semibold serif and title case', () => {
  const heading = token('readingHeading');

  assert.equal(heading.fontFamily, fonts.serifFamily(600));
  assert.equal(heading.fontSize, 19);
  assert.equal(heading.lineHeight, 27);
  assert.equal(heading.letterSpacing, -0.1);
  assert.notEqual(
    heading.textTransform,
    'uppercase',
    'reading headings should not force uppercase'
  );
});

test('the display scale runs at the EL 0.95 leading and -0.04em tracking', () => {
  const expected: Record<string, [number, number, number]> = {
    // token: [fontSize, lineHeight, letterSpacing]
    displayHero: [32, 31, -1.28],
    screenTitle: [28, 27, -1.12],
    pageTitle: [24, 23, -0.96],
    sectionHeading: [18, 18, -0.45],
  };

  for (const [name, [fontSize, lineHeight, letterSpacing]] of Object.entries(expected)) {
    const style = token(name);
    assert.equal(
      style.fontFamily,
      fonts.displayFamily(700),
      `${name} should be set in Alte Haas Bold`
    );
    assert.deepEqual(
      [style.fontSize, style.lineHeight, style.letterSpacing],
      [fontSize, lineHeight, letterSpacing],
      name
    );
  }
});

test('every numeral token carries tabular figures so digits do not jitter', () => {
  const expected: Record<string, [number, number]> = {
    numeralRow: [26, 25],
    numeralXL: [44, 40],
    numeralHero: [72, 61],
    numeralStreak: [84, 71],
  };

  for (const [name, [fontSize, lineHeight]] of Object.entries(expected)) {
    const style = token(name);
    assert.equal(
      style.fontFamily,
      fonts.displayFamily(700),
      `${name} should be set in Alte Haas Bold`
    );
    assert.deepEqual([style.fontSize, style.lineHeight], [fontSize, lineHeight], name);
    assert.deepEqual(
      style.fontVariant,
      ['tabular-nums'],
      `${name} must use tabular figures — these numbers tick in place`
    );
  }
});

test('eyebrow and mono metadata are set in the Alte Haas regular face', () => {
  const regular = fonts.displayFamily(400);

  // The 0.18em eyebrow tracking is metric-matched to Alte Haas. Falling back to
  // the platform UI font here is what made the old eyebrow read as spaced-out
  // system text rather than an EL label.
  const eyebrow = token('eyebrow');
  assert.equal(eyebrow.fontFamily, regular);
  assert.equal(eyebrow.fontSize, 11);
  assert.equal(eyebrow.letterSpacing, 1.98);
  assert.equal(eyebrow.textTransform, 'uppercase');

  // Same face, casing preserved — version strings and provenance lines.
  const eyebrowPlain = token('eyebrowPlain');
  assert.equal(eyebrowPlain.fontFamily, regular);
  assert.notEqual(
    eyebrowPlain.textTransform,
    'uppercase',
    'eyebrowPlain exists precisely so real casing survives'
  );

  const mono = token('mono');
  assert.equal(mono.fontFamily, regular);
  assert.equal(mono.fontSize, 12.5);
  assert.deepEqual(mono.fontVariant, ['tabular-nums']);

  const monoSmall = token('monoSmall');
  assert.equal(monoSmall.fontFamily, regular);
  assert.equal(monoSmall.letterSpacing, 0.88);
  assert.equal(monoSmall.textTransform, 'uppercase');
});

test('motion runs on the EL curve and the redesign durations', () => {
  assert.deepEqual(system.motion.duration, { fast: 150, base: 240, slow: 320 });
  // The EL curve — cubic-bezier(.22, 1, .36, 1).
  assert.deepEqual([...system.motion.easing], [0.22, 1, 0.36, 1]);
});

test('layout ships the EL card, icon-button and pill metrics', () => {
  const { cardPadding, cardPaddingWide, iconButton, pillHeight } =
    system.layout as unknown as Record<string, number>;
  assert.deepEqual([cardPadding, cardPaddingWide, iconButton, pillHeight], [16, 18, 40, 50]);
});
