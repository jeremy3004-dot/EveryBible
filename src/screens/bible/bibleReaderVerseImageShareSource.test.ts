import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen opens a verse-image background picker and captures the shared image', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /import \{ SHARE_VERSE_BACKGROUND_SOURCES \} from '\.\.\/\.\.\/data\/shareVerseBackgrounds';/,
    'BibleReaderScreen should reuse the shared scripture-image background gallery'
  );

  assert.match(
    source,
    /const \[showVerseImageSheet, setShowVerseImageSheet\] = useState\(false\);/,
    'BibleReaderScreen should track the verse-image picker sheet state'
  );

  assert.match(
    source,
    /const \[selectedVerseImageBackgroundIndex, setSelectedVerseImageBackgroundIndex\] = useState\(/,
    'BibleReaderScreen should track the selected verse-image background'
  );

  assert.match(
    source,
    /const verseImageSharePreviewRef = useRef<View \| null>\(null\);/,
    'BibleReaderScreen should keep a capture ref for the verse-image preview'
  );

  assert.match(
    source,
    /const handleOpenVerseImageShare = \(\) => \{/,
    'BibleReaderScreen should open the verse-image picker from the tray action'
  );

  assert.match(
    source,
    /const handleShareSelectedVerseImage = async \(\) => \{/,
    'BibleReaderScreen should have a dedicated share handler for verse images'
  );

  assert.match(
    source,
    /const Sharing = await import\('expo-sharing'\);/,
    'BibleReaderScreen should lazy-load Expo Sharing for verse images'
  );

  assert.match(
    source,
    /const \{ captureRef \} = await import\('react-native-view-shot'\);/,
    'BibleReaderScreen should lazy-load react-native-view-shot for verse images'
  );

  assert.match(
    source,
    /captureRef\(verseImageSharePreviewRef,/,
    'BibleReaderScreen should capture the preview card when sharing the image'
  );

  assert.match(
    source,
    /<Modal[\s\S]*visible=\{showVerseImageSheet\}[\s\S]*chooseVerseImageBackground/s,
    'BibleReaderScreen should render a modal for choosing a verse-image background'
  );

  assert.match(
    source,
    /SHARE_VERSE_BACKGROUND_SOURCES\.map\(/,
    'BibleReaderScreen should render a scrollable gallery of scripture-image background choices'
  );

  assert.match(
    source,
    /ImageBackground[\s\S]*selectedVerseImageBackground/,
    'BibleReaderScreen should render the selected background inside the preview card'
  );
});
