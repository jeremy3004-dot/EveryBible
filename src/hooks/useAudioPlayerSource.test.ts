import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('useAudioPlayer keeps iOS now playing metadata and remote commands wired to the Bible audio flow', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.match(
    source,
    /syncBibleNowPlaying/,
    'useAudioPlayer should publish lock-screen metadata whenever the chapter playback state changes'
  );

  assert.match(
    source,
    /clearBibleNowPlaying/,
    'useAudioPlayer should clear the lock-screen metadata when playback stops'
  );

  assert.match(
    source,
    /subscribeBibleNowPlayingRemoteCommands/,
    'useAudioPlayer should subscribe to native remote-command events for lock-screen controls'
  );
});
