import * as SQLite from 'expo-sqlite';
import { chapterCache } from './chapterCache';
import { importDatabaseFromAssetAsync } from 'expo-sqlite';
import type { Verse } from '../../types';
import { bibleBooks } from '../../constants/books';
import {
  buildBibleFallbackSearchTerms,
  buildBibleSearchQuery,
  buildBibleSubstringSearchTerms,
  buildInstalledBibleDatabaseSource,
  isBundledBibleDatabaseReady,
} from './bibleDataModel';
import {
  ensureTranslationReady,
  resolveRegisteredBibleDatabaseSource,
  type BibleDatabaseSource,
} from './bibleDatabaseSources';
import {
  normalizeVerseFormatting,
  reconcileVerseFormattingWithText,
  serializeVerseFormatting,
} from './verseFormatting';
import {
  cancelPackSearchIndexBuild,
  readPackSearchIndexStatus,
  schedulePackSearchIndexBuild,
  type PackSearchIndexBuildResult,
} from './textPackSearchIndex';

let db: SQLite.SQLiteDatabase | null = null;
const installedDatabaseCache = new Map<string, SQLite.SQLiteDatabase>();
const pendingInstalledDatabaseOpens = new Map<string, Promise<SQLite.SQLiteDatabase>>();
// Search-index cache keys whose index is known to be complete. Only a ready index is cached: a
// pack's index can finish building in the background, so "not ready" is probed again.
const searchIndexReadyCache = new Set<string>();
const DATABASE_NAME = 'bible-bsb-v2.db';
const DATABASE_ASSET_ID: number = require('../../../assets/databases/bible-bsb-v2.db');
export const DEFAULT_MINIMUM_READY_VERSE_COUNT = 120000;
const SQLITE_OPEN_OPTIONS = {
  finalizeUnusedStatementsBeforeClosing: false,
} as const;

export class BibleSearchUnavailableError extends Error {
  readonly translationId: string;

  constructor(translationId: string) {
    super(`Full-text search is not available for translation "${translationId}".`);
    this.name = 'BibleSearchUnavailableError';
    this.translationId = translationId;
  }
}

/**
 * The installed pack for a translation cannot be read: its file is gone, or it is no longer a
 * SQLite database. Either way the only way back is a re-download, which the reader offers when
 * it sees this error (matched by name).
 */
export class MissingInstalledDatabaseError extends Error {
  readonly translationId: string;
  readonly localPath: string;
  readonly reason: 'missing' | 'corrupt';

  constructor(translationId: string, localPath: string, reason: 'missing' | 'corrupt' = 'missing') {
    super(`Installed database file is ${reason} for translation "${translationId}": ${localPath}`);
    this.name = 'MissingInstalledDatabaseError';
    this.translationId = translationId;
    this.localPath = localPath;
    this.reason = reason;
  }
}

// SQLITE_NOTADB and SQLITE_CORRUPT. expo-sqlite wraps SQLite's message in its own text on both
// platforms, so match the message rather than a code. A busy or locked database is transient and
// deliberately does not match: treating it as corruption would throw away a working install.
const CORRUPT_DATABASE_MESSAGE =
  /file is not a database|database disk image is malformed|SQLITE_(?:NOTADB|CORRUPT)\b/i;

function isCorruptDatabaseError(error: unknown): boolean {
  return CORRUPT_DATABASE_MESSAGE.test(error instanceof Error ? error.message : String(error));
}

export {
  ensureTranslationReady,
  setBibleDatabaseSourceResolver,
  setBibleTranslationReadinessResolver,
} from './bibleDatabaseSources';
export type {
  BibleDatabaseSource,
  BibleDatabaseSourceResolver,
  BibleTranslationReadinessResolver,
} from './bibleDatabaseSources';

const bundledBibleDatabaseSource: BibleDatabaseSource = {
  kind: 'bundled',
  databaseName: DATABASE_NAME,
  assetId: DATABASE_ASSET_ID,
};

function resolveBibleDatabaseSource(translationId: string): BibleDatabaseSource {
  return resolveRegisteredBibleDatabaseSource(translationId) ?? bundledBibleDatabaseSource;
}

type BibleDatabaseStatus = {
  verseCount: number;
  schemaVersion: number;
  hasSearchIndex: boolean;
  formattedVerseCount: number;
  ready: boolean;
};

function getSourceCacheKey(source: BibleDatabaseSource): string {
  return `${source.kind}:${source.databaseName}:${source.kind === 'installed' ? source.directory : ''}`;
}

export function getChapterSourceKey(translationId: string): string {
  return getSourceCacheKey(resolveBibleDatabaseSource(translationId));
}

function forgetSearchIndexReadiness(cacheKey: string): void {
  for (const key of searchIndexReadyCache) {
    if (key.startsWith(`${cacheKey}@`)) {
      searchIndexReadyCache.delete(key);
    }
  }
}

export async function invalidateInstalledBibleDatabaseAtPath(localPath: string): Promise<void> {
  chapterCache.clear();
  const source = buildInstalledBibleDatabaseSource('installed', localPath);

  if (!source) {
    return;
  }

  // The pack's search index is built inside the pack file on a connection of its own. Stop it
  // before the caller replaces or deletes the file.
  await cancelPackSearchIndexBuild(localPath);

  const cacheKey = getSourceCacheKey(source);
  forgetSearchIndexReadiness(cacheKey);
  // A first open still in flight caches its handle when it lands; wait for it so that handle is
  // closed here too, rather than cached on a file the caller is about to replace.
  await pendingInstalledDatabaseOpens.get(cacheKey)?.catch(() => undefined);
  const cachedDatabase = installedDatabaseCache.get(cacheKey);

  if (!cachedDatabase) {
    return;
  }

  await closeDatabase(cachedDatabase);
  installedDatabaseCache.delete(cacheKey);
}

async function closeDatabase(database?: SQLite.SQLiteDatabase | null): Promise<void> {
  if (!database) {
    return;
  }

  await database.closeAsync();
}

async function closeBundledDatabase(): Promise<void> {
  chapterCache.clear();
  if (!db) {
    return;
  }

  await closeDatabase(db);
  db = null;
  forgetSearchIndexReadiness(getSourceCacheKey(bundledBibleDatabaseSource));
}

// expo-sqlite's defaultDatabaseDirectory is a bare filesystem path on iOS and Android. The legacy
// FileSystem API needs a file:// URI: it treats a bare path as a read-only bundled resource, so a
// delete is refused and an existence check always reports "missing".
function bundledDatabaseFileUri(suffix = ''): string {
  const directory = SQLite.defaultDatabaseDirectory.replace(/\/*$/, '');
  const directoryUri = directory.startsWith('file://') ? directory : `file://${directory}`;
  return `${directoryUri}/${DATABASE_NAME}${suffix}`;
}

// A forced re-import replaces the .db file, but SQLite may still have -wal/-shm sidecars from the
// prior (possibly corrupt or interrupted) database on disk. Leaving them means the fresh copy can
// get WAL frames replayed onto it on next open, silently reintroducing the state we're recovering
// from — so they must be cleared before the forced copy, not just the .db file itself.
async function deleteStaleJournalSiblings(): Promise<void> {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    await Promise.all(
      ['-wal', '-shm'].map((suffix) =>
        FileSystem.deleteAsync(bundledDatabaseFileUri(suffix), { idempotent: true })
      )
    );
  } catch (error) {
    console.warn('[Bible] Failed to delete stale bundled database journal files:', error);
  }
}

async function verifyDatabaseIntegrity(database: SQLite.SQLiteDatabase): Promise<boolean> {
  try {
    const result = await database.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
    return result?.quick_check === 'ok';
  } catch (error) {
    console.warn('[Bible] PRAGMA quick_check failed:', error);
    return false;
  }
}

async function openBundledDatabase(forceOverwrite = false): Promise<SQLite.SQLiteDatabase> {
  await closeBundledDatabase();

  if (forceOverwrite) {
    await deleteStaleJournalSiblings();
  }

  await importDatabaseFromAssetAsync(DATABASE_NAME, {
    assetId: DATABASE_ASSET_ID,
    forceOverwrite,
  });
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME, SQLITE_OPEN_OPTIONS);
  await database.execAsync('PRAGMA journal_mode = WAL');
  await database.execAsync('PRAGMA cache_size = -4096');
  await database.execAsync('PRAGMA temp_store = MEMORY');

  // Only after a fresh import, since this is the one place corruption from a bad copy or an
  // interrupted prior write would first surface. A failed check must not leave the poisoned
  // handle behind as the shared singleton.
  if (!(await verifyDatabaseIntegrity(database))) {
    await closeDatabase(database);
    throw new Error(
      '[Bible] Bundled database failed integrity check (PRAGMA quick_check) after import'
    );
  }

  await ensurePerformanceIndexes(database);
  db = database;
  return database;
}

// Partial index so the `formatting IS NOT NULL` count in inspectOpenDatabase is an
// index-only scan instead of a full table scan on every cold start. Created at runtime
// (idempotent) so it does not require rebuilding the bundled DB asset / bumping the
// schema-version gate constants.
const FORMATTED_VERSES_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_verses_formatted ON verses(id) WHERE formatting IS NOT NULL';

async function ensurePerformanceIndexes(database: SQLite.SQLiteDatabase): Promise<void> {
  try {
    await database.execAsync(FORMATTED_VERSES_INDEX_SQL);
  } catch (error) {
    // A missing index only costs a slower count; never let it block DB readiness.
    console.warn('[Bible] Failed to ensure performance indexes:', error);
  }
}

async function inspectOpenDatabase(database: SQLite.SQLiteDatabase): Promise<BibleDatabaseStatus> {
  const countResult = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM verses'
  );
  const schemaResult = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const ftsResult = await database.getFirstAsync<{ present: number }>(
    "SELECT COUNT(*) as present FROM sqlite_master WHERE type = 'table' AND name = 'verses_fts'"
  );
  const formattedResult = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM verses WHERE formatting IS NOT NULL'
  );

  const status = {
    verseCount: countResult?.count ?? 0,
    schemaVersion: schemaResult?.user_version ?? 0,
    hasSearchIndex: (ftsResult?.present ?? 0) > 0,
    formattedVerseCount: formattedResult?.count ?? 0,
  };

  return {
    ...status,
    ready: isBundledBibleDatabaseReady(status, DEFAULT_MINIMUM_READY_VERSE_COUNT),
  };
}

async function isSearchIndexReady(
  database: SQLite.SQLiteDatabase,
  source: BibleDatabaseSource
): Promise<boolean> {
  const packVersion = source.kind === 'installed' ? source.packVersion : undefined;
  const readyKey = `${getSourceCacheKey(source)}@${packVersion ?? ''}`;
  if (searchIndexReadyCache.has(readyKey)) {
    return true;
  }

  const ready = (await readPackSearchIndexStatus(database, packVersion)) === 'ready';
  if (ready) {
    searchIndexReadyCache.add(readyKey);
  }
  return ready;
}

/**
 * Builds the full-text index inside the installed text pack for this translation, in the
 * background, unless it is already built. Returns the build (shared with any build already
 * running for the pack), or null for the bundled database, which ships its index.
 */
export function scheduleTextPackSearchIndexBuild(
  translationId: string
): Promise<PackSearchIndexBuildResult> | null {
  const source = resolveBibleDatabaseSource(translationId);
  if (source.kind !== 'installed') {
    return null;
  }
  return schedulePackSearchIndexBuild({
    directory: source.directory,
    databaseName: source.databaseName,
    packVersion: source.packVersion,
  });
}

async function ensureBundledDatabaseReady(
  minimumReadyVerseCount: number
): Promise<SQLite.SQLiteDatabase> {
  try {
    const database = await openBundledDatabase(false);
    const status = await inspectOpenDatabase(database);

    if (isBundledBibleDatabaseReady(status, minimumReadyVerseCount)) {
      return database;
    }
  } catch (error) {
    console.warn('[Bible] Bundled database check failed, attempting recovery:', error);
  }

  const recoveredDatabase = await openBundledDatabase(true);
  const recoveredStatus = await inspectOpenDatabase(recoveredDatabase);

  if (!isBundledBibleDatabaseReady(recoveredStatus, minimumReadyVerseCount)) {
    // A not-ready database must not linger as the shared singleton — the next caller should
    // retry from a clean slate instead of reusing a handle we just declared broken.
    await closeBundledDatabase();
    throw new Error(
      `[Bible] Bundled database is not ready after recovery (${recoveredStatus.verseCount} verses)`
    );
  }

  return recoveredDatabase;
}

// Shared by initDatabase/getDatabase/inspectBundledDatabaseStatus so concurrent cold-start
// callers (e.g. isBibleDataReady() and initBibleData() firing close together) don't race each
// other into duplicate imports/recovery cycles against the same underlying .db file.
let bundledInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function acquireBundledDatabaseSingleFlight(
  minimumReadyVerseCount: number
): Promise<SQLite.SQLiteDatabase> {
  if (!bundledInitPromise) {
    bundledInitPromise = ensureBundledDatabaseReady(minimumReadyVerseCount).finally(() => {
      bundledInitPromise = null;
    });
  }
  return bundledInitPromise;
}

export async function initDatabase(
  minimumReadyVerseCount = DEFAULT_MINIMUM_READY_VERSE_COUNT
): Promise<BibleDatabaseStatus> {
  if (db) {
    try {
      const existingStatus = await inspectOpenDatabase(db);

      if (isBundledBibleDatabaseReady(existingStatus, minimumReadyVerseCount)) {
        return existingStatus;
      }

      console.warn('[Bible] Open bundled database is stale, reloading from asset:', existingStatus);
    } catch (error) {
      console.warn('[Bible] Failed to inspect open bundled database, reloading from asset:', error);
    }
  }

  const database = await acquireBundledDatabaseSingleFlight(minimumReadyVerseCount);
  return inspectOpenDatabase(database);
}

function notReadyStatus(): BibleDatabaseStatus {
  return {
    verseCount: 0,
    schemaVersion: 0,
    hasSearchIndex: false,
    formattedVerseCount: 0,
    ready: false,
  };
}

async function bundledDatabaseFileExists(): Promise<boolean> {
  const FileSystem = await import('expo-file-system/legacy');
  const info = await FileSystem.getInfoAsync(bundledDatabaseFileUri());
  return info.exists;
}

export async function inspectBundledDatabaseStatus(
  minimumReadyVerseCount = DEFAULT_MINIMUM_READY_VERSE_COUNT
): Promise<BibleDatabaseStatus> {
  if (bundledInitPromise) {
    try {
      await bundledInitPromise;
    } catch {
      // initDatabase/getDatabase's own recovery path already logged the failure; fall through
      // to probe whatever state the bundled database is actually in now.
    }
  }

  // A handle this probe opened itself. It is closed on the way out unless it became the shared
  // handle; the shared handle, when one exists, is only borrowed.
  let probeDb: SQLite.SQLiteDatabase | null = null;

  try {
    // On a fresh install nothing has imported the asset yet. Opening the missing file would
    // create an empty database, and the native asset import skips any file that already exists,
    // so the first launch would fall through to the forced-recovery import.
    if (!db && !(await bundledDatabaseFileExists())) {
      return notReadyStatus();
    }

    const database =
      db ?? (probeDb = await SQLite.openDatabaseAsync(DATABASE_NAME, SQLITE_OPEN_OPTIONS));
    const status = await inspectOpenDatabase(database);
    const ready = isBundledBibleDatabaseReady(status, minimumReadyVerseCount);

    // An initialization can start while the probe is reading (the check above ran before it).
    // It owns the file then: it may be replacing it and will install its own shared handle, so
    // adopting the probe would leave one of the two handles open forever.
    const initializationOwnsFile = () => db !== null || bundledInitPromise !== null;
    if (ready && probeDb && !initializationOwnsFile()) {
      const candidate = probeDb;
      await candidate.execAsync('PRAGMA journal_mode = WAL');
      await candidate.execAsync('PRAGMA cache_size = -4096');
      await candidate.execAsync('PRAGMA temp_store = MEMORY');
      await ensurePerformanceIndexes(candidate);
      if (!initializationOwnsFile()) {
        db = candidate;
        probeDb = null;
      }
    }

    return {
      ...status,
      ready,
    };
  } catch (error) {
    console.warn('[Bible] Failed to inspect bundled database status:', error);
    return notReadyStatus();
  } finally {
    if (probeDb) {
      await probeDb.closeAsync();
    }
  }
}

export async function getDatabase(translationId: string = 'bsb'): Promise<SQLite.SQLiteDatabase> {
  await ensureTranslationReady(translationId);
  const source = resolveBibleDatabaseSource(translationId);

  if (source.kind === 'bundled') {
    if (!db) {
      await initDatabase();
    }

    if (!db) {
      throw new Error('[Bible] Bundled database failed to initialize');
    }
    return db;
  }

  const cacheKey = getSourceCacheKey(source);
  const cachedDatabase = installedDatabaseCache.get(cacheKey);
  if (cachedDatabase) {
    return cachedDatabase;
  }

  // The reader, its prefetch and a search open a pack together on first use. Separate opens
  // would each cache a handle, and the one overwritten in the cache would never be closed when
  // the pack is replaced, keeping the old file and its WAL open underneath the new one.
  const pendingOpen = pendingInstalledDatabaseOpens.get(cacheKey);
  if (pendingOpen) {
    return pendingOpen;
  }
  const opening = openInstalledDatabase(source, cacheKey).finally(() => {
    pendingInstalledDatabaseOpens.delete(cacheKey);
  });
  pendingInstalledDatabaseOpens.set(cacheKey, opening);
  return opening;
}

async function openInstalledDatabase(
  source: Extract<BibleDatabaseSource, { kind: 'installed' }>,
  cacheKey: string
): Promise<SQLite.SQLiteDatabase> {
  const localPath = `${source.directory}/${source.databaseName}`;
  const FileSystem = await import('expo-file-system/legacy');
  const fileInfo = await FileSystem.getInfoAsync(localPath);
  if (!fileInfo.exists || fileInfo.size === 0) {
    throw new MissingInstalledDatabaseError(source.translationId, localPath);
  }

  let database: SQLite.SQLiteDatabase | null = null;
  try {
    database = await SQLite.openDatabaseAsync(
      source.databaseName,
      SQLITE_OPEN_OPTIONS,
      source.directory
    );
    // The first statement on a file that is not (or no longer) a database fails here.
    await database.execAsync('PRAGMA journal_mode = WAL');
  } catch (error) {
    await database?.closeAsync().catch(() => undefined);
    if (isCorruptDatabaseError(error)) {
      throw new MissingInstalledDatabaseError(source.translationId, localPath, 'corrupt');
    }
    throw error;
  }
  installedDatabaseCache.set(cacheKey, database);
  return database;
}

/**
 * Damage that only shows once a page is read (a pack truncated or overwritten after install)
 * surfaces from a query on a handle that opened fine. Drop that handle and report the pack as
 * unreadable so the reader resets the install instead of failing on every chapter.
 */
async function toInstalledDatabaseReadError(
  translationId: string,
  error: unknown
): Promise<unknown> {
  const source = resolveBibleDatabaseSource(translationId);
  if (source.kind !== 'installed' || !isCorruptDatabaseError(error)) {
    return error;
  }
  const localPath = `${source.directory}/${source.databaseName}`;
  try {
    await invalidateInstalledBibleDatabaseAtPath(localPath);
  } catch (invalidateError) {
    console.warn('[Bible] Failed to drop the handle on a damaged text pack:', invalidateError);
  }
  return new MissingInstalledDatabaseError(source.translationId, localPath, 'corrupt');
}

export async function getChapter(
  translationId: string,
  bookId: string,
  chapter: number
): Promise<Verse[]> {
  const database = await getDatabase(translationId);
  let results: VerseRow[];
  try {
    results = await database.getAllAsync<VerseRow>(
      `
        SELECT id, book_id, chapter, verse, text, heading, formatting
        FROM verses
        WHERE translation_id = ? AND book_id = ? AND chapter = ?
        ORDER BY verse
      `,
      [translationId, bookId, chapter]
    );
  } catch (error) {
    throw await toInstalledDatabaseReadError(translationId, error);
  }

  return results.map((row) => ({
    id: row.id,
    bookId: row.book_id,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text,
    heading: row.heading ?? undefined,
    formatting: reconcileVerseFormattingWithText(
      row.text,
      normalizeVerseFormatting(row.formatting)
    ),
  }));
}

type VerseRow = {
  id: number;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
  heading: string | null;
  formatting: string | null;
};

function toVerse(row: VerseRow): Verse {
  return {
    id: row.id,
    bookId: row.book_id,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text,
    heading: row.heading ?? undefined,
    formatting: reconcileVerseFormattingWithText(
      row.text,
      normalizeVerseFormatting(row.formatting)
    ),
  };
}

let canonicalBookOrderSql: string | null = null;

// Pack row ids follow the upstream import, not the canon, so order by book explicitly.
function getCanonicalBookOrderSql(): string {
  canonicalBookOrderSql ??= `CASE book_id ${bibleBooks
    .filter((book) => /^[A-Z0-9]+$/.test(book.id))
    .map((book, index) => `WHEN '${book.id}' THEN ${index}`)
    .join(' ')} ELSE ${bibleBooks.length} END`;
  return canonicalBookOrderSql;
}

// Devanagari and other Indic text writes zero-width joiners after a virama (परमेश्‍वर; 19,594
// npiulb verses carry one) that keyboards do not type, and the FTS tokenizer ignores. Compare
// without them on both sides, or परमेश्वर matched 81 of its 3,932 verses. Only for words in
// the scripts that use joiners (Arabic through Sinhala): the replace() makes a Latin scan ~3x
// slower.
const JOINER_FREE_TEXT_SQL = "replace(replace(text, char(8205), ''), char(8204), '')";
const JOINER_PATTERN = /\u200C|\u200D/g;
const JOINER_SCRIPT_PATTERN = /[\u0600-\u06FF]|[\u0900-\u0DFF]/;

// Substring search for scripts written without spaces between words (see
// buildBibleSubstringSearchTerms), and for any text pack whose FTS index is still being built
// or failed to build. Every term must appear; a term is a list of spellings, any of which may
// match. instr() has no wildcard characters, so terms need no escaping, and it needs no FTS
// index. It scans the translation's verses (about 31,000; 3-60 ms on a desktop, see
// docs/research/pack-search-index-2026-09-24.md), which is fast enough for a debounced search
// box, and returns at most `limit` rows.
async function searchVersesBySubstring(
  database: SQLite.SQLiteDatabase,
  translationId: string,
  terms: string[][],
  limit: number
): Promise<Verse[]> {
  const joinerFree = terms.map((spellings) =>
    spellings.some((spelling) => JOINER_SCRIPT_PATTERN.test(spelling))
  );
  const conditions = terms
    .map((spellings, index) => {
      const column = joinerFree[index] ? JOINER_FREE_TEXT_SQL : 'text';
      return `AND (${spellings.map(() => `instr(${column}, ?) > 0`).join(' OR ')})`;
    })
    .join(' ');
  const joinerFreeTerms = terms.map((spellings, index) =>
    joinerFree[index]
      ? spellings.map((spelling) => spelling.replace(JOINER_PATTERN, ''))
      : spellings
  );
  const rows = await database.getAllAsync<VerseRow>(
    `
      SELECT id, book_id, chapter, verse, text, heading, formatting
      FROM verses
      WHERE translation_id = ? ${conditions}
      ORDER BY ${getCanonicalBookOrderSql()}, chapter, verse
      LIMIT ?
    `,
    [translationId, ...joinerFreeTerms.flat(), limit]
  );

  return rows.map(toVerse);
}

export async function searchVerses(
  translationId: string,
  query: string,
  limit = 50
): Promise<Verse[]> {
  const database = await getDatabase(translationId);
  const source = resolveBibleDatabaseSource(translationId);
  const substringTerms = buildBibleSubstringSearchTerms(query.trim());

  if (substringTerms) {
    return searchVersesBySubstring(
      database,
      translationId,
      substringTerms.map((term) => [term]),
      limit
    );
  }

  const ftsQuery = buildBibleSearchQuery(query.trim());

  if (!ftsQuery) {
    return [];
  }

  if (!(await isSearchIndexReady(database, source))) {
    if (source.kind !== 'installed') {
      throw new BibleSearchUnavailableError(translationId);
    }
    // Packs are published without an index. Build it now in the background (a no-op while one
    // is running, or for ten minutes after one failed) and answer this search by substring.
    void scheduleTextPackSearchIndexBuild(translationId);
    return searchVersesBySubstring(
      database,
      translationId,
      buildBibleFallbackSearchTerms(query.trim()),
      limit
    );
  }

  try {
    const indexedResults = await database.getAllAsync<VerseRow>(
      `
        SELECT v.*
        FROM verses_fts
        JOIN verses v ON v.id = verses_fts.rowid
        WHERE verses_fts MATCH ? AND v.translation_id = ?
        ORDER BY bm25(verses_fts), v.book_id, v.chapter, v.verse
        LIMIT ?
      `,
      [ftsQuery, translationId, limit]
    );

    return indexedResults.map(toVerse);
  } catch (error) {
    console.warn('[Bible] Indexed search failed:', error);
    throw error;
  }
}

export async function insertVerse(translationId: string, verse: Omit<Verse, 'id'>): Promise<void> {
  const database = await getDatabase(translationId);
  await database.runAsync(
    `
      INSERT INTO verses (translation_id, book_id, chapter, verse, text, heading, formatting)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      translationId,
      verse.bookId,
      verse.chapter,
      verse.verse,
      verse.text,
      verse.heading ?? null,
      serializeVerseFormatting(verse.formatting),
    ]
  );
  chapterCache.clear();
}

export async function insertVerses(
  translationId: string,
  verses: Omit<Verse, 'id'>[]
): Promise<void> {
  const database = await getDatabase(translationId);

  await database.withTransactionAsync(async () => {
    for (const verse of verses) {
      await database.runAsync(
        `
          INSERT INTO verses (translation_id, book_id, chapter, verse, text, heading, formatting)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          translationId,
          verse.bookId,
          verse.chapter,
          verse.verse,
          verse.text,
          verse.heading ?? null,
          serializeVerseFormatting(verse.formatting),
        ]
      );
    }
  });
  chapterCache.clear();
}

export async function getVerseCount(): Promise<number> {
  const status = await inspectBundledDatabaseStatus();
  return status.verseCount;
}
