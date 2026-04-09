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

  assert.equal(
    source.includes('useAudioStore.getState().setPosition(Math.max(currentPosition, cappedInterpolated));'),
    true,
    'useAudioPlayer should keep the interpolation timer from regressing the displayed position between native updates'
  );
});

test('useAudioPlayer keeps chapter duration stable and clamps interpolation to the known chapter length', () => {
  const source = readRelativeSource('../../hooks/useAudioPlayer.ts');

  assert.equal(
    source.includes('const currentDuration = useAudioStore.getState().duration;'),
    true,
    'useAudioPlayer should read the current known duration before applying a native snapshot'
  );
  assert.equal(
    source.includes('snapshot.durationMillis > 0 ? Math.max(currentDuration, snapshot.durationMillis) : currentDuration;'),
    true,
    'useAudioPlayer should not let a zero or shorter native snapshot collapse the known chapter duration while the current chapter is still playing'
  );

  assert.equal(
    source.includes('const cappedInterpolated ='),
    true,
    'useAudioPlayer should derive a capped interpolation target while the chapter is playing'
  );
  assert.equal(
    source.includes('currentDuration > 0 ? Math.min(interpolated, currentDuration) : interpolated;'),
    true,
    'useAudioPlayer should keep interpolation from visually outrunning the known chapter duration'
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

test('background music pauses immediately when scripture playback pauses', () => {
  const source = readRelativeSource('./backgroundMusicPlayer.ts');

  assert.match(
    source,
    /if \(!shouldPlay\) \{[\s\S]*await this\.sound\.setVolumeAsync\(0\);[\s\S]*await this\.sound\.pauseAsync\(\);[\s\S]*return;[\s\S]*\}/s,
    'BackgroundMusicPlayer should mute and pause the loaded music bed immediately when playback pauses instead of waiting for the crossfade timer'
  );
});
