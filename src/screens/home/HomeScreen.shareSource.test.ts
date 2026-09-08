import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen captures a verse image and falls back to text sharing', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.equal(
    source.includes("import * as Sharing from 'expo-sharing';"),
    false,
    'HomeScreen should not eagerly import expo-sharing on the startup path'
  );

  assert.equal(
    source.includes("from '../../stores';"),
    false,
    'HomeScreen should avoid the stores barrel on the startup path'
  );

  assert.equal(
    source.includes("from '../../services/bible';"),
    false,
    'HomeScreen should avoid the bible barrel because it evaluates reader/download modules before the first screen'
  );

  assert.equal(
    source.includes("from '../../services/audio';"),
    false,
    'HomeScreen should avoid the audio barrel because it evaluates playback/download modules before the first screen'
  );

  assert.match(
    source,
    /const \{ getDailyScripture \} = await import\('\.\.\/\.\.\/services\/bible\/bibleService'\);/,
    'HomeScreen should lazy-load Bible database access after interactions when loading verse-of-day text'
  );

  assert.match(
    source,
    /import \{ useBibleStore \} from '\.\.\/\.\.\/stores\/bibleStore';/,
    'HomeScreen should import the bible store directly on the startup path'
  );

  assert.match(
    source,
    /const Sharing = await import\('expo-sharing'\);/,
    'HomeScreen should lazy-load Expo Sharing only when the share button is pressed'
  );

  assert.match(
    source,
    /const \{ captureRef \} = await import\('react-native-view-shot'\);/,
    'HomeScreen should lazy-load react-native-view-shot only when the share button is pressed'
  );

  assert.match(
    source,
    /const handleShareVerseOfTheDay = async \(\) => \{/,
    'HomeScreen should define a dedicated share handler for the verse of the day'
  );

  assert.match(
    source,
    /buildHomeVerseShareMessage\(/,
    'HomeScreen should build a text fallback for non-image sharing'
  );

  assert.match(
    source,
    /const renderVerseShareButton = \(\) => \(/,
    'HomeScreen should factor the verse share button into a helper'
  );

  assert.match(
    source,
    /<IconButton\s+icon=\{ShareGlyph\}[\s\S]*variant="onPhoto"[\s\S]*accessibilityLabel=\{t\('groups\.share'\)\}/,
    'The hero should expose an icon-only on-photo share button with a shared translation label for accessibility'
  );

  assert.match(
    source,
    /styles\.heroActionRow[\s\S]*\{renderVerseShareButton\(\)\}/,
    'The hero should render the share button at the end of the action row when showActions is true'
  );

  assert.equal(
    source.includes('sharePromptCard'),
    false,
    'HomeScreen should not render the separate share prompt card below the verse card'
  );

  assert.equal(
    source.includes('renderHeroActions'),
    false,
    'HomeScreen should not define or call renderHeroActions after the Listen/Read buttons were removed'
  );

  assert.match(
    source,
    /renderVerseOfTheDayCard\(false\)/,
    'HomeScreen should render a capture-only share preview without the visible button'
  );

  assert.match(
    source,
    /renderVerseOfTheDayCard\(true\)/,
    'HomeScreen should render the visible verse card with actions'
  );

  assert.equal(
    source.includes('common.share'),
    false,
    'HomeScreen should not render the broken common.share key on the verse share control'
  );
});

test('HomeScreen keeps the hero photograph visible behind readable light text', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  // The hero is a photograph in both scopes. It must keep a dark readability
  // scrim with light text in every theme so the text never washes out
  // "light on light" on the vellum scope.
  assert.match(
    source,
    /'rgba\(12, 11, 9, 0\.72\)',/,
    'The hero should close the scrim down under the verse so the Scripture stays readable in every theme'
  );

  assert.equal(
    /imageStyle=\{[^}]*opacity/.test(source),
    false,
    'The hero photograph runs at full strength — readability comes from the scrim, not from fading the image'
  );

  assert.match(
    source,
    /const ON_PHOTO_INK = '#FDFAF5';/,
    'Verse text should use a fixed light color so it reads over the dark scrim in every theme'
  );
});

test('HomeScreen renders the rotating daily verse rather than a hardcoded passage', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  // Regression: the visible card previously rendered a hardcoded Psalm 23 hero
  // constant, so the verse never changed day to day even though the daily
  // reference rotates by day-of-year.
  assert.equal(
    source.includes('HOME_HERO_SCRIPTURE_TEXT'),
    false,
    'HomeScreen should not render a hardcoded verse-of-the-day passage'
  );

  assert.match(
    source,
    /\{verseShareBodyText\}/,
    'The visible verse card should render the dynamic daily verse text'
  );

  assert.match(
    source,
    /\{verseShareReferenceLabel\}/,
    'The visible verse card should render the dynamic daily verse reference'
  );
});
