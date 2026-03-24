import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('book-grid rows assign stable keys to rendered book cards', () => {
  const source = readRelativeSource('./BibleBrowserScreen.tsx');

  assert.match(
    source,
    /keyExtractor=\{\(item\) => item\.id\}/,
    'BibleBrowserScreen should give each rendered row a stable key via keyExtractor so the list does not emit React key warnings'
  );
});
