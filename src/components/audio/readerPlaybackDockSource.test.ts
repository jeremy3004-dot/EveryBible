import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('ReaderPlaybackDock renders a circular progress ring around the persistent play button', () => {
  const source = readRelativeSource('./ReaderPlaybackDock.tsx');

  assert.match(
    source,
    /from 'react-native-svg'/,
    'ReaderPlaybackDock should draw the chapter progress ring with react-native-svg'
  );

  assert.match(
    source,
    /<Svg[\s\S]*<Circle[\s\S]*strokeDasharray=\{circumference\}[\s\S]*strokeDashoffset=\{strokeDashoffset\}/s,
    'ReaderPlaybackDock should convert chapter playback progress into a circular stroke around the play button'
  );
});

test('ReaderPlaybackDock collapses the side chapter arrows away while keeping the center play control visible', () => {
  const source = readRelativeSource('./ReaderPlaybackDock.tsx');

  assert.match(
    source,
    /collapseProgress:\s*number;/,
    'ReaderPlaybackDock should accept the reader collapse progress from the premium scroll chrome'
  );

  assert.match(
    source,
    /isCollapsed:\s*boolean;/,
    'ReaderPlaybackDock should know when the read-mode dock has crossed the compact threshold'
  );

  assert.match(
    source,
    /leftTransportAnimatedStyle = useAnimatedStyle\(/,
    'ReaderPlaybackDock should animate the previous-chapter control out as the reader collapses'
  );

  assert.match(
    source,
    /rightTransportAnimatedStyle = useAnimatedStyle\(/,
    'ReaderPlaybackDock should animate the next-chapter control out as the reader collapses'
  );

  assert.match(
    source,
    /pointerEvents=\{isCollapsed \? 'none' : 'auto'\}/,
    'ReaderPlaybackDock should disable side-arrow taps once the dock has collapsed down to the play button'
  );
});

test('ReaderPlaybackDock can expose chapter audio sharing beside the persistent play button', () => {
  const source = readRelativeSource('./ReaderPlaybackDock.tsx');

  assert.match(
    source,
    /onShareAudio\?: \(\) => void;/,
    'ReaderPlaybackDock should accept an optional audio share action from the reader'
  );

  assert.match(
    source,
    /const showShareAudioButton = typeof onShareAudio === 'function';/,
    'ReaderPlaybackDock should render the share affordance only when audio sharing is available'
  );

  assert.match(
    source,
    /styles\.shareAudioButton[\s\S]*onPress=\{onShareAudio\}[\s\S]*Ionicons name="share-outline"/s,
    'ReaderPlaybackDock should render a direct share button that opens the existing audio share sheet'
  );
});
