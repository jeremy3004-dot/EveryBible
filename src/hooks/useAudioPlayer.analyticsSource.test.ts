import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('useAudioPlayer primes approximate location when a listening session starts', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.match(
    source,
    /primeAnalyticsLocationForCurrentSession\('listening'\)/,
    'useAudioPlayer should prime approximate location while the user is actively starting audio playback'
  );
});
