import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('useAudioPlayer imports only the stores it needs', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.equal(
    source.includes("from '../stores';"),
    false,
    'useAudioPlayer should not import the full stores barrel on the startup audio path'
  );

  assert.match(
    source,
    /import \{ useAudioStore \} from '\.\.\/stores\/audioStore';/,
    'useAudioPlayer should import the audio store directly'
  );

  assert.match(
    source,
    /import \{ useLibraryStore \} from '\.\.\/stores\/libraryStore';/,
    'useAudioPlayer should import the library store directly'
  );
});
