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
    /if \(db\) \{[\s\S]*const existingStatus = await inspectOpenDatabase\(db\);[\s\S]*if \(isBundledBibleDatabaseReady\(existingStatus, minimumReadyVerseCount\)\) \{[\s\S]*return existingStatus;[\s\S]*\}[\s\S]*\}/,
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
    /if \(ftsQuery && !\(await hasSearchIndexTable\(database,\s*cacheKey\)\)\) \{[\s\S]*throw new BibleSearchUnavailableError\(translationId\);[\s\S]*\}/,
    'searchVerses should fail fast when a translation lacks verses_fts instead of trying a CPU-heavy table scan'
  );

  assert.doesNotMatch(
    source,
    /text LIKE \?/,
    'searchVerses should not run a LIKE fallback against verses.text when no full-text index exists'
  );
});

test('openBundledDatabase verifies integrity with PRAGMA quick_check after import and closes a failed handle instead of leaving it as the singleton', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /async function verifyDatabaseIntegrity\(database: SQLite\.SQLiteDatabase\): Promise<boolean> \{[\s\S]*PRAGMA quick_check[\s\S]*\}/,
    'bibleDatabase.ts should expose a helper that runs PRAGMA quick_check against a freshly opened database'
  );

  assert.match(
    source,
    /if \(!\(await verifyDatabaseIntegrity\(database\)\)\) \{[\s\S]*await closeDatabase\(database\);[\s\S]*throw new Error\([\s\S]*\}/,
    'openBundledDatabase should close a database handle that fails PRAGMA quick_check instead of assigning it to the shared singleton'
  );
});

test('openBundledDatabase deletes stale -wal/-shm sidecars before a forced re-import', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /async function deleteStaleJournalSiblings\(\): Promise<void> \{[\s\S]*\['-wal', '-shm'\]\.map\(/,
    'bibleDatabase.ts should delete -wal and -shm sidecar files before a forced re-import so stale WAL frames cannot replay onto the fresh copy'
  );

  assert.match(
    source,
    /if \(forceOverwrite\) \{[\s\S]{0,80}await deleteStaleJournalSiblings\(\);[\s\S]{0,80}\}[\s\S]*await importDatabaseFromAssetAsync/,
    'openBundledDatabase should delete stale journal siblings before importDatabaseFromAssetAsync runs with forceOverwrite'
  );
});

test('ensureBundledDatabaseReady nulls the shared singleton before throwing when recovery still is not ready', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /if \(!isBundledBibleDatabaseReady\(recoveredStatus, minimumReadyVerseCount\)\) \{[\s\S]{0,400}await closeBundledDatabase\(\);[\s\S]{0,120}throw new Error\(/,
    'ensureBundledDatabaseReady should close and null the shared bundled database singleton before throwing so a broken handle is never left behind for the next caller to reuse'
  );
});

test('bundled database init is gated behind a single shared in-flight promise across initDatabase/getDatabase/inspectBundledDatabaseStatus', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /let bundledInitPromise: Promise<SQLite\.SQLiteDatabase> \| null = null;/,
    'bibleDatabase.ts should track a single shared in-flight bundled database init promise'
  );

  assert.match(
    source,
    /function acquireBundledDatabaseSingleFlight\([\s\S]*if \(!bundledInitPromise\) \{[\s\S]*bundledInitPromise = ensureBundledDatabaseReady\(minimumReadyVerseCount\)\.finally\(\(\) => \{[\s\S]*bundledInitPromise = null;[\s\S]*\}\);[\s\S]*\}[\s\S]*return bundledInitPromise;/,
    'acquireBundledDatabaseSingleFlight should memoize concurrent calls onto the same ensureBundledDatabaseReady promise and clear it once settled'
  );

  assert.match(
    source,
    /const database = await acquireBundledDatabaseSingleFlight\(minimumReadyVerseCount\);/,
    'initDatabase should route its cold-start path through the shared single-flight gate instead of calling ensureBundledDatabaseReady directly'
  );

  assert.match(
    source,
    /export async function inspectBundledDatabaseStatus\([\s\S]{0,200}if \(bundledInitPromise\) \{[\s\S]*await bundledInitPromise;/,
    'inspectBundledDatabaseStatus should await any in-flight bundled database init before probing, so it does not race a concurrent import/recovery cycle'
  );
});

test('getDatabase refuses to silently create an empty SQLite file for a missing installed translation pack', () => {
  const source = readRelativeSource('./bibleDatabase.ts');

  assert.match(
    source,
    /export class MissingInstalledDatabaseError extends Error/,
    'bibleDatabase.ts should expose a dedicated error for installed translation packs whose file is missing on disk'
  );

  assert.match(
    source,
    /const localPath = `\$\{source\.directory\}\/\$\{source\.databaseName\}`;[\s\S]*const fileInfo = await FileSystem\.getInfoAsync\(localPath\);[\s\S]*if \(!fileInfo\.exists \|\| fileInfo\.size === 0\) \{[\s\S]*throw new MissingInstalledDatabaseError\(source\.translationId, localPath\);[\s\S]*\}/,
    'getDatabase should check the installed pack file exists and is non-empty before opening it, instead of letting SQLite.openDatabaseAsync silently create a 0-byte file'
  );
});
