import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('the app defines a shared professional design system module', () => {
  const designSystemPath = fileURLToPath(new URL('./system.ts', import.meta.url).href);

  assert.equal(existsSync(designSystemPath), true, 'src/design/system.ts should exist');

  const source = readFileSync(designSystemPath, 'utf8');

  assert.equal(
    source.includes('export const spacing'),
    true,
    'design system should export spacing'
  );
  assert.equal(source.includes('export const radius'), true, 'design system should export radius');
  assert.equal(
    source.includes('export const typography'),
    true,
    'design system should export typography'
  );
  assert.equal(
    source.includes('export const shadows'),
    true,
    'design system should export shadows'
  );
});

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
  const source = readRelativeSource('./system.ts');

  const readingHeadingBlock = source.match(/readingHeading:\s*{[\s\S]*?}\s*satisfies TextStyle,/);

  assert.ok(readingHeadingBlock, 'readingHeading should exist in the shared design system');
  assert.match(readingHeadingBlock![0], /fontFamily:\s*serifSemiBold/);
  assert.match(readingHeadingBlock![0], /fontSize:\s*19,/);
  assert.match(readingHeadingBlock![0], /lineHeight:\s*27,/);
  assert.match(readingHeadingBlock![0], /letterSpacing:\s*-0\.1,/);
  assert.equal(
    readingHeadingBlock![0].includes("textTransform: 'uppercase'"),
    false,
    'reading headings should not force uppercase'
  );
});

// ---------------------------------------------------------------------------
// EL redesign — the token values screen agents build against. These are locked
// here so a stray edit to one number cannot silently retune the whole app.
// ---------------------------------------------------------------------------

function readTokenBlock(source: string, token: string): string {
  const block = source.match(new RegExp(`\\b${token}: \\{[\\s\\S]*?\\} satisfies TextStyle,`));
  assert.ok(block, `typography.${token} should exist in the shared design system`);
  return block![0];
}

test('the display scale runs at the EL 0.95 leading and -0.04em tracking', () => {
  const source = readRelativeSource('./system.ts');

  const expected: Record<string, [number, number, number]> = {
    // token: [fontSize, lineHeight, letterSpacing]
    displayHero: [32, 31, -1.28],
    screenTitle: [28, 27, -1.12],
    pageTitle: [24, 23, -0.96],
    sectionHeading: [18, 18, -0.45],
  };

  for (const [token, [fontSize, lineHeight, letterSpacing]] of Object.entries(expected)) {
    const block = readTokenBlock(source, token);
    assert.match(block, /fontFamily: displayBold/, `${token} should be set in Alte Haas Bold`);
    assert.match(block, new RegExp(`fontSize: ${fontSize},`), `${token} fontSize`);
    assert.match(block, new RegExp(`lineHeight: ${lineHeight},`), `${token} lineHeight`);
    assert.match(
      block,
      new RegExp(`letterSpacing: ${String(letterSpacing).replace('.', '\\.')},`),
      `${token} letterSpacing`
    );
  }
});

test('every numeral token carries tabular figures so digits do not jitter', () => {
  const source = readRelativeSource('./system.ts');

  const expected: Record<string, [number, number]> = {
    numeralRow: [26, 25],
    numeralXL: [44, 40],
    numeralHero: [72, 61],
    numeralStreak: [84, 71],
  };

  for (const [token, [fontSize, lineHeight]] of Object.entries(expected)) {
    const block = readTokenBlock(source, token);
    assert.match(block, /fontFamily: displayBold/, `${token} should be set in Alte Haas Bold`);
    assert.match(block, new RegExp(`fontSize: ${fontSize},`), `${token} fontSize`);
    assert.match(block, new RegExp(`lineHeight: ${lineHeight},`), `${token} lineHeight`);
    assert.match(
      block,
      /fontVariant: \['tabular-nums'\]/,
      `${token} must use tabular figures — these numbers tick in place`
    );
  }
});

test('eyebrow and mono metadata are set in the Alte Haas regular face', () => {
  const source = readRelativeSource('./system.ts');

  // The 0.18em eyebrow tracking is metric-matched to Alte Haas. Falling back to
  // the platform UI font here is what made the old eyebrow read as spaced-out
  // system text rather than an EL label.
  const eyebrow = readTokenBlock(source, 'eyebrow');
  assert.match(eyebrow, /fontFamily: displayRegular/);
  assert.match(eyebrow, /fontSize: 11,/);
  assert.match(eyebrow, /letterSpacing: 1\.98,/);
  assert.match(eyebrow, /textTransform: 'uppercase'/);

  // Same face, casing preserved — version strings and provenance lines.
  const eyebrowPlain = readTokenBlock(source, 'eyebrowPlain');
  assert.match(eyebrowPlain, /fontFamily: displayRegular/);
  assert.equal(
    eyebrowPlain.includes("textTransform: 'uppercase'"),
    false,
    'eyebrowPlain exists precisely so real casing survives'
  );

  const mono = readTokenBlock(source, 'mono');
  assert.match(mono, /fontFamily: displayRegular/);
  assert.match(mono, /fontSize: 12\.5,/);
  assert.match(mono, /fontVariant: \['tabular-nums'\]/);

  const monoSmall = readTokenBlock(source, 'monoSmall');
  assert.match(monoSmall, /fontFamily: displayRegular/);
  assert.match(monoSmall, /letterSpacing: 0\.88,/);
  assert.match(monoSmall, /textTransform: 'uppercase'/);
});

test('motion runs on the EL curve and the redesign durations', () => {
  const source = readRelativeSource('./system.ts');

  assert.match(source, /fast: 150,/, 'press/instant feedback is 150ms');
  assert.match(source, /base: 240,/, 'the standard transition is 240ms');
  assert.match(source, /slow: 320,/);
  assert.match(
    source,
    /easing: \[0\.22, 1, 0\.36, 1\] as const/,
    'the EL curve — cubic-bezier(.22, 1, .36, 1)'
  );
});

test('layout ships the EL card, icon-button and pill metrics', () => {
  const source = readRelativeSource('./system.ts');

  assert.match(source, /cardPadding: 16,/);
  assert.match(source, /cardPaddingWide: 18,/);
  assert.match(source, /iconButton: 40,/);
  assert.match(source, /pillHeight: 50,/);
});
