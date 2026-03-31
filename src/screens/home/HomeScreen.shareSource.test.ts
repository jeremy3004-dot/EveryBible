import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen captures a verse image and falls back to text sharing', () => {
  const source = readRelativeSource('./HomeScreen.tsx');

  assert.match(
    source,
    /import \* as Sharing from 'expo-sharing';/,
    'HomeScreen should use Expo Sharing to share a captured image file'
  );

  assert.match(
    source,
    /import \{ captureRef \} from 'react-native-view-shot';/,
    'HomeScreen should capture the verse card as an image before sharing'
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
    /accessibilityLabel=\{t\('groups\.share'\)\}[\s\S]*Ionicons[\s\S]*name="share-outline"/,
    'The verse card should expose an icon-only share button with a shared translation label for accessibility'
  );

  assert.match(
    source,
    /styles\.verseShareRow/,
    'The verse share button should sit in a bottom-aligned footer row'
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
    source.includes("common.share"),
    false,
    'HomeScreen should not render the broken common.share key on the verse share control'
  );
});
