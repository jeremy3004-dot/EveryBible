import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('initDatabase revalidates an already-open bundled database before reusing it', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /if \(db\) \{[\s\S]*const existingStatus = await inspectOpenDatabase\(db\);[\s\S]*if \(isBundledBibleDatabaseReady\(existingStatus, minimumReadyVerseCount\)\) \{[\s\S]*return;[\s\S]*\}[\s\S]*\}/,
    'initDatabase should inspect any existing bundled database handle and only reuse it when the schema, verse count, and search index are still ready'
  );
});
