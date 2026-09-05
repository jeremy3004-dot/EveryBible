import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('ReaderPlaybackDock uses fixed reference-sized transport discs without a progress ring', () => {
  const source = readRelativeSource('./ReaderPlaybackDock.tsx');
  const motion = readRelativeSource('../../screens/bible/readerChromeMotion.ts');

  assert.doesNotMatch(
    source,
    /react-native-svg|<Svg|<Circle|strokeDasharray|strokeDashoffset/,
    'The persistent play disc should not bring back the visible playback ring'
  );
  assert.match(motion, /READER_PLAY_BUTTON_SIZE = 64;/);
  assert.match(motion, /READER_CHAPTER_BUTTON_SIZE = 40;/);
  assert.match(
    source,
    /playButton:\s*\{\s*width: READER_PLAY_BUTTON_SIZE,\s*height: READER_PLAY_BUTTON_SIZE,/,
    'Play should use the reference diameter in both dimensions'
  );
  assert.match(
    source,
    /sideTransportButton:\s*\{\s*width: READER_CHAPTER_BUTTON_SIZE,\s*height: READER_CHAPTER_BUTTON_SIZE,/,
    'Both chapter buttons should use the reference diameter'
  );
});

test('ReaderPlaybackDock collapses the side chapter arrows away while keeping the center play control visible', () => {
  const source = readRelativeSource('./ReaderPlaybackDock.tsx');

  assert.match(
    source,
    /collapseProgress:\s*SharedValue<number>;/,
    'ReaderPlaybackDock should accept the reader collapse progress as a SharedValue so the dock animates on the UI thread'
  );

  assert.match(
    source,
    /isCollapsed:\s*boolean;/,
    'ReaderPlaybackDock should know when the read-mode dock has crossed the compact threshold'
  );

  assert.match(
    source,
    /sideTransportAnimatedStyle = useAnimatedStyle\(/,
    'Both chapter controls should share one UI-thread translation'
  );

  assert.match(
    source,
    /\[0, READER_TAB_BAR_COLLAPSE_DISTANCE - READER_PLAY_COLLAPSE_TRAVEL\]/,
    'Arrows should travel the remaining distance beyond the whole dock so they match the tab capsule'
  );
  assert.equal(source.match(/styles\.sideTransportWrap, sideTransportAnimatedStyle/g)?.length, 2);

  assert.match(
    source,
    /pointerEvents=\{isCollapsed \? 'none' : 'auto'\}/,
    'ReaderPlaybackDock should disable side-arrow taps once the dock has collapsed down to the play button'
  );
});

test('ReaderPlaybackDock does not render the floating audio share button above the play control', () => {
  const source = readRelativeSource('./ReaderPlaybackDock.tsx');

  assert.doesNotMatch(
    source,
    /styles\.shareAudioButton|accessibilityLabel="Share chapter audio"|Ionicons name="share-outline"/,
    'ReaderPlaybackDock must not reintroduce the floating share button above the persistent play button'
  );

  assert.doesNotMatch(
    source,
    /onShareAudio\?: \(\) => void;|showShareAudioButton/,
    'ReaderPlaybackDock should not accept or derive a share callback for the removed floating button'
  );
});
