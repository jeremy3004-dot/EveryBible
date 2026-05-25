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
    source.includes(
      'useAudioStore.getState().setPosition(Math.max(currentPosition, cappedInterpolated));'
    ),
    true,
    'useAudioPlayer should keep the interpolation timer from regressing the displayed position between native updates'
  );

  assert.equal(
    source.includes('AUDIO_POSITION_INTERPOLATION_INTERVAL_MS = 250'),
    true,
    'useAudioPlayer should throttle interpolated position updates so Android playback does not flood the JS thread'
  );
});

test('audio progress does not persist every playback tick', () => {
  const source = readRelativeSource('../../stores/audioStore.ts');
  const storageSource = readRelativeSource('../../stores/mmkvStorage.ts');

  assert.match(
    source,
    /lastPosition:\s*Math\.abs\(position - state\.lastPosition\) >= 5000 \|\| position === 0[\s\S]*\? position[\s\S]*: state\.lastPosition/,
    'AudioStore should only move the persisted resume position in coarse steps, not on every visible progress update'
  );

  assert.match(
    storageSource,
    /if \(mmkvInstance\.getString\(name\) === value\) \{[\s\S]*return;[\s\S]*\}/,
    'MMKV storage should skip redundant writes when Zustand persist serializes unchanged partial state'
  );
});

test('audio controls update state before awaiting native pause and stop calls', () => {
  const source = readRelativeSource('../../hooks/useAudioPlayer.ts');

  assert.match(
    source,
    /const pause = useCallback\(async \(\) => \{[\s\S]*setStatus\('paused'\);[\s\S]*await audioPlayer\.pause\(\);/s,
    'Pause should make the UI responsive before waiting for the native audio pause promise'
  );

  assert.match(
    source,
    /const stop = useCallback\(async \(\) => \{[\s\S]*resetPlayback\(\);[\s\S]*await audioPlayer\.stop\(\);/s,
    'Stop should clear the UI playback state before waiting for native audio teardown'
  );
});

test('audio pause and stop invalidate in-flight chapter loads', () => {
  const source = readRelativeSource('../../hooks/useAudioPlayer.ts');

  assert.match(
    source,
    /const pause = useCallback\(async \(\) => \{[\s\S]*playRequestIdRef\.current \+= 1;/s,
    'Pause should invalidate an in-flight load so a late native completion cannot restart playback'
  );
  assert.match(
    source,
    /const stop = useCallback\(async \(\) => \{[\s\S]*playRequestIdRef\.current \+= 1;/s,
    'Stop should invalidate an in-flight load so a late native completion cannot mark playback as active'
  );
  assert.match(
    source,
    /await audioPlayer\.loadAndPlay\(audioData\.url, playbackRate\);[\s\S]*if \(playRequestId !== playRequestIdRef\.current\) \{[\s\S]*await audioPlayer\.stop\(\);[\s\S]*return;[\s\S]*\}/s,
    'Playback start should re-check the request generation after native loading finishes'
  );
});

test('useAudioPlayer keeps chapter duration stable and clamps interpolation to the known chapter length', () => {
  const source = readRelativeSource('../../hooks/useAudioPlayer.ts');

  assert.equal(
    source.includes('const currentDuration = useAudioStore.getState().duration;'),
    true,
    'useAudioPlayer should read the current known duration before applying a native snapshot'
  );
  assert.match(
    source,
    /snapshot\.durationMillis > 0\s*\?\s*Math\.max\(currentDuration, snapshot\.durationMillis\)\s*:\s*currentDuration;/,
    'useAudioPlayer should not let a zero or shorter native snapshot collapse the known chapter duration while the current chapter is still playing'
  );

  assert.equal(
    source.includes('const cappedInterpolated ='),
    true,
    'useAudioPlayer should derive a capped interpolation target while the chapter is playing'
  );
  assert.equal(
    source.includes(
      'currentDuration > 0 ? Math.min(interpolated, currentDuration) : interpolated;'
    ),
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
