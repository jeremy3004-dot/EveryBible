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
    /Ionicons[\s\S]*name="share-social-outline"/,
    'The verse card should show a compact share button'
  );

  assert.match(
    source,
    /const renderVerseOfTheDayCard = \(showActions: boolean\) => \(/,
    'HomeScreen should factor the verse card into a reusable renderer'
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
});
