import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('PlaybackControls supports a chapter-only transport variant without 10-second skip buttons', () => {
  const source = readRelativeSource('./PlaybackControls.tsx');

  assert.match(
    source,
    /variant\?: 'default' \| 'chapter-only'/,
    'PlaybackControls should expose a chapter-only variant for simplified Bible listen layouts'
  );

  assert.match(
    source,
    /const showSkipControls = variant === 'default';/,
    'PlaybackControls should derive skip-button visibility from the selected variant'
  );

  assert.match(
    source,
    /\{showSkipControls \? \(\s*<TouchableOpacity[\s\S]*styles\.skipButton/s,
    'PlaybackControls should only render the 10-second skip buttons when the default variant is active'
  );
});

test('PlaybackControls exposes a repeat utility button alongside playback speed controls', () => {
  const source = readRelativeSource('./PlaybackControls.tsx');

  assert.match(
    source,
    /repeatMode: RepeatMode;/,
    'PlaybackControls should accept repeat mode from the shared audio player state'
  );

  assert.match(
    source,
    /onCycleRepeatMode: \(\) => void;/,
    'PlaybackControls should let listen surfaces cycle the repeat mode from a shared utility button'
  );

  assert.match(
    source,
    /<TouchableOpacity[\s\S]*onPress=\{\(\) => onCycleRepeatMode\(\)\}[\s\S]*renderRepeatModeIcon/s,
    'PlaybackControls should render a repeat button in the utility row'
  );
});

test('Bible listen surfaces opt into the chapter-only transport variant', () => {
  const audioFirstSource = readRelativeSource('./AudioFirstChapterCard.tsx');
  const readerSource = readRelativeSource('../../screens/bible/BibleReaderScreen.tsx');

  assert.match(
    audioFirstSource,
    /<PlaybackControls[\s\S]*variant="chapter-only"/,
    'AudioFirstChapterCard should use the simplified chapter-only player transport'
  );

  assert.match(
    readerSource,
    /<PlaybackControls[\s\S]*variant="chapter-only"/,
    'BibleReaderScreen listen mode should use the simplified chapter-only player transport'
  );
});
