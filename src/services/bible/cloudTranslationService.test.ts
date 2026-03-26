import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('cloud translation downloads stage the sqlite file before activating it', () => {
  const source = readRelativeSource('./cloudTranslationService.ts');

  assert.match(source, /const stagingDatabaseName = `\$\{translationId\}\.staging\.db`;/);
  assert.match(source, /await FileSystem\.moveAsync\(\{ from: stagingDbPath, to: finalDbPath \}\);/);
});

test('cloud translation downloads avoid building an FTS index during install', () => {
  const source = readRelativeSource('./cloudTranslationService.ts');

  assert.doesNotMatch(
    source,
    /CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts/,
    'downloaded translations should avoid FTS creation because expo-sqlite is crashing in native closeDatabase after FTS rebuild on iOS'
  );
});

test('cloud translation downloads disable sqlite auto-finalization before closeAsync', () => {
  const source = readRelativeSource('./cloudTranslationService.ts');

  assert.match(
    source,
    /SQLite\.openDatabaseAsync\(\s*stagingDatabaseName,\s*\{\s*finalizeUnusedStatementsBeforeClosing:\s*false,?\s*\},\s*directory\s*\)/,
    'downloaded translations should opt out of expo-sqlite auto-finalization before closeAsync because Expo tracks a native AsyncQueue crash for this path'
  );
});
