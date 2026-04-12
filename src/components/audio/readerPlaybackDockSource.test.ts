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

test('ReaderPlaybackDock can hide the center play control for readers who want a quieter dock', () => {
  const source = readRelativeSource('./ReaderPlaybackDock.tsx');

  assert.match(
    source,
    /hidePlayButton\?: boolean;/,
    'ReaderPlaybackDock should accept a hidePlayButton preference from the reader screen'
  );

  assert.match(
    source,
    /const showPlayButton = hidePlayButton !== true;/,
    'ReaderPlaybackDock should derive play-button visibility from the hidePlayButton flag'
  );

  assert.match(
    source,
    /\{showPlayButton \? \(/,
    'ReaderPlaybackDock should only render the center play button when it is allowed to show'
  );
});
