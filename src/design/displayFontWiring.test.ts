// Codebase-wide static lint (not a behaviour test): every display-token surface merges the useDisplayFont override.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Imported from the dependency-free module: `fonts.ts` pulls in react-native.
import { getDisplayFontFamily, displayFamily } from './scriptCoverage';

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url).href), 'utf8');

// Alte Haas Grotesk covers 297 codepoints — Latin-1 and a little. It cannot
// render 14 of the 21 interface languages this app ships, so every surface that
// puts a display token on TRANSLATED text has to merge the useDisplayFont()
// override. Without it those locales fall through to whatever per-glyph fallback
// the OS happens to do, with EL's tight display tracking still applied.
test('the display face falls back for every script it cannot render', () => {
  for (const language of [
    'ru',
    'uk',
    'bg',
    'sr',
    'mk', // Cyrillic — Lora covered these, Alte Haas does not
    'vi', // precomposed Vietnamese diacritics
    'hi',
    'ne',
    'mr',
    'bn',
    'ta',
    'te',
    'pa',
    'ur',
    'ar',
    'zh',
    'ja',
    'ko',
  ]) {
    assert.equal(
      getDisplayFontFamily(language, 700),
      undefined,
      `${language} must fall back to the platform font, not render in the display face`
    );
  }

  // Latin locales keep the EL display face.
  for (const language of ['en', 'es', 'fr', 'de', 'pt', 'id', 'tr']) {
    assert.equal(
      getDisplayFontFamily(language, 700),
      displayFamily(700),
      `${language} should render in the EL display face`
    );
  }

  // Regional tags resolve on their base subtag.
  assert.equal(getDisplayFontFamily('ru-RU', 700), undefined);
  assert.equal(getDisplayFontFamily('en-GB', 700), displayFamily(700));
});

// Every screen that renders translated text through a display token must merge
// the override. This guards against the resolver silently becoming dead code.
test('every display-token surface merges the useDisplayFont override', () => {
  const surfaces = [
    '../screens/home/HomeScreen.tsx',
    '../screens/more/MoreScreen.tsx',
    '../screens/bible/ChapterSelectorScreen.tsx',
    '../screens/bible/BibleBrowserScreen.tsx',
    '../screens/learn/LessonDetailScreen.tsx',
    '../screens/plans/PlanDetailScreen.tsx',
    '../screens/plans/PlansHomeScreen.tsx',
    '../screens/plans/RhythmDetailScreen.tsx',
    '../screens/plans/RhythmComposerScreen.tsx',
    '../screens/auth/AuthScreen.tsx',
    '../screens/auth/ResetPasswordScreen.tsx',
    '../components/ui/Sheet.tsx',
    '../components/ui/EmptyState.tsx',
    // Eyebrow and mono are display-face tokens too, and these surfaces put
    // translated copy in them: SectionHeader's count, ListRow's trailing value
    // (a language's own native name, among others), the group badges, the
    // reader's audio-share label and the reading-activity session window.
    '../components/ui/SectionHeader.tsx',
    '../components/ui/ListRow.tsx',
    '../screens/learn/GroupListScreen.tsx',
    '../screens/bible/BibleReaderScreen.tsx',
    '../screens/more/ReadingActivityScreen.tsx',
  ];

  for (const surface of surfaces) {
    const source = read(surface);
    assert.match(
      source,
      /const displayFont = useDisplayFont\(\);/,
      `${surface} uses a display typography token, so it must call useDisplayFont()`
    );
    assert.match(
      source,
      /displayFont\.(bold|regular)/,
      `${surface} must merge the display override into the styles it renders`
    );
  }
});

// The shared primitives (SectionHeader eyebrow/title, ListRow value) are the
// highest-leverage case; their fallback is rendered under a Cyrillic locale in
// components/ui/primitives.render.test.tsx.
