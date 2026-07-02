import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('reconcileTranslationPacks treats a zero-byte installed pack file as missing', () => {
  const source = readRelativeSource('./bibleStore.ts');

  assert.match(
    source,
    /async function fileSystemPathIsUsableDatabase\(localPath: string\): Promise<boolean> \{[\s\S]*const fileInfo = await FileSystem\.getInfoAsync\(localPath\);[\s\S]*return fileInfo\.exists && fileInfo\.size > 0;[\s\S]*\}/,
    'bibleStore.ts should expose a helper that treats an existing but empty (0-byte) pack file as unusable, ' +
      'since getDatabase can leave a 0-byte SQLite file behind for a missing installed translation pack'
  );

  assert.match(
    source,
    /if \(!\(await fileSystemPathIsUsableDatabase\(translation\.textPackLocalPath \?\? ''\)\)\) \{\s*missingTranslationIds\.add\(translation\.id\);/,
    'reconcileTranslationPacks should route through the usable-database check instead of a bare existence check'
  );
});
