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

test('cloud translation downloads write verses through an exclusive sqlite transaction', () => {
  const source = readRelativeSource('./cloudTranslationService.ts');

  assert.match(
    source,
    /await database\.withExclusiveTransactionAsync\(async \(txn\) => \{[\s\S]*await txn\.runAsync\(/,
    "downloaded translation installs should use Expo SQLite's exclusive transaction API for batched writes so async install work does not trip the non-exclusive rollback path"
  );

  assert.doesNotMatch(
    source,
    /withTransactionAsync\(/,
    'downloaded translation installs should not rely on the non-exclusive transaction helper for batched sqlite writes'
  );
});

test('cloud translation downloads force a self-contained sqlite file before activation', () => {
  const source = readRelativeSource('./cloudTranslationService.ts');

  assert.match(
    source,
    /await database\.execAsync\('PRAGMA journal_mode = DELETE'\)/,
    'downloaded translation installs should force DELETE journal mode so moving the main sqlite file does not strand schema or verse rows in WAL sidecars'
  );

  assert.match(
    source,
    /await verifyInstalledTranslationDatabase\(\{[\s\S]*expectedVerseCount:\s*allVerses\.length[\s\S]*\}\);/,
    'downloaded translation installs should reopen the activated sqlite file and verify the verses table before marking the translation as installed'
  );
});

test('catalog text-pack downloads fetch the sqlite file directly before activation', () => {
  const source = readRelativeSource('./cloudTranslationService.ts');

  assert.match(source, /export async function downloadCatalogTextPack\(/);
  assert.match(source, /const resolvedDownloadUrl = resolveBibleAssetUrl\(params\.downloadUrl\);/);
  assert.match(source, /await FileSystem\.downloadAsync\(resolvedDownloadUrl,\s*stagingDbPath\);/);
  assert.match(
    source,
    /await verifyInstalledTranslationDatabase\(\{[\s\S]*expectedVerseCount[\s\S]*\}\);/
  );
});

test('bible store prefers catalog text packs over row-by-row Supabase downloads when available', () => {
  const source = readRelativeSource('../../stores/bibleStore.ts');

  assert.match(source, /const textPack = translation\?\.catalog\?\.text;/);
  assert.match(source, /textPack\s*\?\s*downloadCatalogTextPack\(/);
});
