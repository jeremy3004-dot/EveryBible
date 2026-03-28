import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('background music stays lazy until playback is active', () => {
  const source = readRelativeSource('./backgroundMusicPlayer.ts');

  assert.match(
    source,
    /if \(!shouldPlay\) \{[\s\S]*if \(!this\.sound\) \{[\s\S]*this\.currentChoice = choice;[\s\S]*return;[\s\S]*\}[\s\S]*return;[\s\S]*\}[\s\S]*await this\.ensureLoaded\(choice\);/,
    'BackgroundMusicPlayer should avoid loading an AVAsset while the app is idle or paused, and only resolve the sound once playback is active'
  );
});

test('useAudioPlayer avoids subscribing to the entire audio store on every playback tick', () => {
  const source = readRelativeSource('../../hooks/useAudioPlayer.ts');

  assert.equal(
    source.includes('useAudioStore()'),
    false,
    'useAudioPlayer should not subscribe to the full audio store because position updates would rerender every consumer on each playback tick'
  );

  assert.match(
    source,
    /useAudioStore\([\s\S]*useShallow\(\(state\) => \(\{/,
    'useAudioPlayer should use a shallow selector so playback updates only rerender consumers that actually depend on changed fields'
  );
});

test('useAudioPlayer keeps playback position monotonic across status snapshots', () => {
  const source = readRelativeSource('../../hooks/useAudioPlayer.ts');

  assert.match(
    source,
    /const currentPosition = useAudioStore\.getState\(\)\.currentPosition;[\s\S]*const nextPosition = Math\.max\(currentPosition, snapshot\.positionMillis\);[\s\S]*setPosition\(nextPosition\);/s,
    'useAudioPlayer should refuse to move the visible playback position backwards when a stop-like status snapshot arrives'
  );

  assert.match(
    source,
    /const interpolated = lastPollPositionRef\.current \+ elapsed \* playbackRate;[\s\S]*const currentPosition = useAudioStore\.getState\(\)\.currentPosition;[\s\S]*useAudioStore\.getState\(\)\.setPosition\(Math\.max\(currentPosition, interpolated\)\);/s,
    'useAudioPlayer should keep the interpolation timer from regressing the displayed position between native updates'
  );
});

test('useAudioPlayer stops syncing background music every tick once music is turned off', () => {
  const source = readRelativeSource('../../hooks/useAudioPlayer.ts');

  assert.match(
    source,
    /if \(backgroundMusicChoice === 'off'\) \{[\s\S]*void backgroundMusicPlayer\.stop\(\);[\s\S]*return;[\s\S]*\}/s,
    'useAudioPlayer should stop background music once when the user turns it off'
  );

  assert.match(
    source,
    /if \(backgroundMusicChoice === 'off'\) \{[\s\S]*return;[\s\S]*\}[\s\S]*const shouldPlayBackgroundMusic =[\s\S]*backgroundMusicPlayer\.sync\(backgroundMusicChoice, shouldPlayBackgroundMusic\)/s,
    'useAudioPlayer should skip background-music sync work entirely when the choice is off'
  );
});
