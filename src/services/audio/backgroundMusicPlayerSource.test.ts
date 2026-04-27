import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const source = readFileSync(join(__dirname, 'backgroundMusicPlayer.ts'), 'utf8');

test('background music loop crossfade runs independent fade timers for both sounds', () => {
  assert.match(
    source,
    /private fadeTimers = new Map<Audio\.Sound, ReturnType<typeof setInterval>>\(\);/,
    'BackgroundMusicPlayer should track fade timers per sound so outgoing and incoming loop fades do not cancel each other'
  );

  assert.match(
    source,
    /this\.retiringSounds\.add\(oldSound\);[\s\S]*this\.fadeVolume\(oldSound, this\.targetVolume, 0/s,
    'BackgroundMusicPlayer should keep the outgoing loop alive while it fades out'
  );

  assert.match(
    source,
    /this\.fadeVolume\(newSound, 0, this\.targetVolume\);/,
    'BackgroundMusicPlayer should fade the replacement loop in over the outgoing loop'
  );

  assert.match(
    source,
    /await this\.unloadRetiringSounds\(\);[\s\S]*await this\.sound\.setVolumeAsync\(0\);/s,
    'BackgroundMusicPlayer should clean up an outgoing loop if the user pauses during a crossfade'
  );
});
