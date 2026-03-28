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
    /useAudioStore\(useShallow\(\(state\) => \(\{/,
    'useAudioPlayer should use a shallow selector so playback updates only rerender consumers that actually depend on changed fields'
  );
});
