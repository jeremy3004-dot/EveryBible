// Startup import-graph guard: useAudioPlayer (and the ./audioPlayer modules it is
// built from) is on the startup audio path and must import individual stores, not
// the stores barrel; allowed by docs/testing.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

const playerModulePaths = [
  './useAudioPlayer.ts',
  ...readdirSync(fileURLToPath(new URL('./audioPlayer/', import.meta.url).href))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => `./audioPlayer/${name}`),
];

test('useAudioPlayer imports only the stores it needs', () => {
  assert.ok(playerModulePaths.length > 1, 'expected the ./audioPlayer modules');

  playerModulePaths.forEach((path) => {
    const source = readRelativeSource(path);
    assert.equal(
      /from '(\.\.\/)+stores';/.test(source),
      false,
      `${path} should not import the full stores barrel on the startup audio path`
    );
  });

  assert.match(
    readRelativeSource('./useAudioPlayer.ts'),
    /import \{ useAudioStore \} from '\.\.\/stores\/audioStore';/,
    'useAudioPlayer should import the audio store directly'
  );

  assert.match(
    readRelativeSource('./audioPlayer/transportControls.ts'),
    /import \{ useLibraryStore \} from '\.\.\/\.\.\/stores\/libraryStore';/,
    'the player transport should import the library store directly'
  );
});
