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

test('bible database source resolver can route a translation to an installed SQLite directory', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /BibleDatabaseSourceResolver[\s\S]*setBibleDatabaseSourceResolver[\s\S]*resolveBibleDatabaseSource[\s\S]*bibleDatabaseSourceResolver\(translationId\) \?\? bundledBibleDatabaseSource/,
    'bibleDatabase.ts should expose a small injected resolver seam with bundled fallback'
  );
});

test('getDatabase opens the resolved SQLite source directory for translation-aware packs', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(source, /export async function getDatabase\(/);
  assert.match(source, /const source = resolveBibleDatabaseSource\(translationId\)/);
  assert.match(
    source,
    /SQLite\.openDatabaseAsync\(\s*source\.databaseName,\s*SQLITE_OPEN_OPTIONS,\s*source\.directory\s*\)/
  );
});

test('installed translation databases can be invalidated when a pack is replaced', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /export async function invalidateInstalledBibleDatabaseAtPath\(localPath: string\): Promise<void>/,
    'bibleDatabase.ts should expose a way to close cached installed sqlite handles when a downloaded translation pack is replaced'
  );

  assert.match(
    source,
    /installedDatabaseCache\.delete\(cacheKey\)/,
    'invalidating an installed translation database should remove the cached sqlite handle after it is closed'
  );
});

test('bible database opens disable sqlite auto-finalization before close paths', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /const SQLITE_OPEN_OPTIONS = \{\s*finalizeUnusedStatementsBeforeClosing:\s*false,?\s*\}/,
    'bibleDatabase.ts should define sqlite open options that disable auto-finalization to avoid iOS closeDatabase crashes'
  );
  assert.match(
    source,
    /SQLite\.openDatabaseAsync\(\s*DATABASE_NAME,\s*SQLITE_OPEN_OPTIONS\s*\)/,
    'bundled bible database opens should let Expo resolve the default sqlite directory internally'
  );
  assert.match(
    source,
    /temporaryDb\s*=\s*db\s*\?\?\s*\(await SQLite\.openDatabaseAsync\(\s*DATABASE_NAME,\s*SQLITE_OPEN_OPTIONS\s*\)\)/,
    'bundled status inspection should probe sqlite by opening the default bundled database path directly'
  );
  assert.doesNotMatch(
    source,
    /getInfoAsync\(getDatabasePath\(\)\)/,
    'bundled status inspection should not rely on raw filesystem path checks before probing sqlite'
  );
});

test('bundled status inspection keeps the ready bundled database open for reuse', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /const status = await inspectOpenDatabase\(temporaryDb\);[\s\S]*const ready = isBundledBibleDatabaseReady\(status, minimumReadyVerseCount\);[\s\S]*if \(!db && temporaryDb && ready\) \{[\s\S]*db = temporaryDb;[\s\S]*temporaryDb = null;[\s\S]*\}/,
    'bundled status inspection should promote a ready temporary bundled database into the shared handle so iOS startup does not immediately close and reopen the same SQLite file'
  );
});

test('bundled database readiness inspects formatting payload availability', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /SELECT COUNT\(\*\) as count FROM verses WHERE formatting IS NOT NULL/,
    'bundled bible readiness should count verses with formatting payloads so stale pre-formatting installs get re-imported'
  );
});

test('full-text search refuses non-FTS translations instead of falling back to an unbounded LIKE scan', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /export class BibleSearchUnavailableError extends Error/,
    'bibleDatabase.ts should expose a dedicated error for translations that do not support full-text search'
  );

  assert.match(
    source,
    /if \(ftsQuery && !\(await hasSearchIndexTable\(database\)\)\) \{[\s\S]*throw new BibleSearchUnavailableError\(translationId\);[\s\S]*\}/,
    'searchVerses should fail fast when a translation lacks verses_fts instead of trying a CPU-heavy table scan'
  );

  assert.doesNotMatch(
    source,
    /text LIKE \?/,
    'searchVerses should not run a LIKE fallback against verses.text when no full-text index exists'
  );
});
