import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('bibleStore wires incremental audio-book completion into the audio download flow', () => {
  const source = readRelativeSource('./bibleStore.ts');

  assert.match(
    source,
    /onBookComplete:\s*handleAudioBookComplete/,
    'bibleStore should subscribe to per-book audio download completion events'
  );

  assert.match(
    source,
    /mergeDownloadedAudioBook\(/,
    'bibleStore should append each finished audio book into the downloaded list as it completes'
  );
});
