// Source-shape guard by design: these assertions cover render/persistence/ordering
// constraints in useAudioPlayer.ts and mmkvStorage.ts that a runtime test cannot observe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

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

test('audio progress does not persist every playback tick', () => {
  const storageSource = readRelativeSource('../../stores/mmkvStorage.ts');

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
});

test('useAudioPlayer clamps interpolation to the known chapter length', () => {
  const source = readRelativeSource('../../hooks/useAudioPlayer.ts');

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
