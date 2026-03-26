import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { defaultDatabaseDirectory, importDatabaseFromAssetAsync } from 'expo-sqlite';
import type { Verse } from '../../types';
import { buildBibleSearchQuery, isBundledBibleDatabaseReady } from './bibleDataModel';

let db: SQLite.SQLiteDatabase | null = null;
const installedDatabaseCache = new Map<string, SQLite.SQLiteDatabase>();
const DATABASE_NAME = 'bible-bsb-v2.db';
const DATABASE_ASSET_ID: number = require('../../../assets/databases/bible-bsb-v2.db');
const DEFAULT_MINIMUM_READY_VERSE_COUNT = 90000;

export type BibleDatabaseSource =
  | {
      kind: 'bundled';
      databaseName: string;
      assetId: number;
      directory?: string;
    }
  | {
      kind: 'installed';
      translationId: string;
      databaseName: string;
      directory: string;
    };

export type BibleDatabaseSourceResolver = (translationId: string) => BibleDatabaseSource | null;

const bundledBibleDatabaseSource: BibleDatabaseSource = {
  kind: 'bundled',
  databaseName: DATABASE_NAME,
  assetId: DATABASE_ASSET_ID,
  directory: String(defaultDatabaseDirectory).replace(/\/$/, ''),
};

let bibleDatabaseSourceResolver: BibleDatabaseSourceResolver = () => null;

export function setBibleDatabaseSourceResolver(resolver: BibleDatabaseSourceResolver | null): void {
  bibleDatabaseSourceResolver = resolver ?? (() => null);
}

function resolveBibleDatabaseSource(translationId: string): BibleDatabaseSource {
  return bibleDatabaseSourceResolver(translationId) ?? bundledBibleDatabaseSource;
}

type BibleDatabaseStatus = {
  verseCount: number;
  schemaVersion: number;
  hasSearchIndex: boolean;
  ready: boolean;
};

function getDatabasePath(): string {
  return `${bundledBibleDatabaseSource.directory ?? String(defaultDatabaseDirectory).replace(/\/$/, '')}/${DATABASE_NAME}`;
}

function getSourceCacheKey(source: BibleDatabaseSource): string {
  return `${source.kind}:${source.databaseName}:${source.kind === 'installed' ? source.directory : source.directory ?? ''}`;
}

async function closeDatabase(database?: SQLite.SQLiteDatabase | null): Promise<void> {
  if (!database) {
    return;
  }

  await database.closeAsync();
}

async function closeBundledDatabase(): Promise<void> {
  if (!db) {
    return;
  }

  await closeDatabase(db);
  db = null;
}

async function openBundledDatabase(forceOverwrite = false): Promise<SQLite.SQLiteDatabase> {
  await closeBundledDatabase();
  await importDatabaseFromAssetAsync(DATABASE_NAME, {
    assetId: DATABASE_ASSET_ID,
    forceOverwrite,
  });
  db = await SQLite.openDatabaseAsync(DATABASE_NAME, undefined, bundledBibleDatabaseSource.directory);
  await db.execAsync('PRAGMA journal_mode = WAL');
  return db;
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

  const status = {
    verseCount: countResult?.count ?? 0,
    schemaVersion: schemaResult?.user_version ?? 0,
    hasSearchIndex: (ftsResult?.present ?? 0) > 0,
  };

  return {
    ...status,
    ready: isBundledBibleDatabaseReady(status, DEFAULT_MINIMUM_READY_VERSE_COUNT),
  };
}

async function hasSearchIndexTable(database: SQLite.SQLiteDatabase): Promise<boolean> {
  const result = await database.getFirstAsync<{ present: number }>(
    "SELECT COUNT(*) as present FROM sqlite_master WHERE type = 'table' AND name = 'verses_fts'"
  );

  return (result?.present ?? 0) > 0;
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
    throw new Error(
      `[Bible] Bundled database is not ready after recovery (${recoveredStatus.verseCount} verses)`
    );
  }

  return recoveredDatabase;
}

export async function initDatabase(
  minimumReadyVerseCount = DEFAULT_MINIMUM_READY_VERSE_COUNT
): Promise<void> {
  if (db) {
    try {
      const existingStatus = await inspectOpenDatabase(db);

      if (isBundledBibleDatabaseReady(existingStatus, minimumReadyVerseCount)) {
        return;
      }

      console.warn('[Bible] Open bundled database is stale, reloading from asset:', existingStatus);
    } catch (error) {
      console.warn('[Bible] Failed to inspect open bundled database, reloading from asset:', error);
    }
  }

  await ensureBundledDatabaseReady(minimumReadyVerseCount);
}

export async function inspectBundledDatabaseStatus(
  minimumReadyVerseCount = DEFAULT_MINIMUM_READY_VERSE_COUNT
): Promise<BibleDatabaseStatus> {
  const fileInfo = await FileSystem.getInfoAsync(getDatabasePath());

  if (!fileInfo.exists) {
    return {
      verseCount: 0,
      schemaVersion: 0,
      hasSearchIndex: false,
      ready: false,
    };
  }

  let temporaryDb: SQLite.SQLiteDatabase | null = null;

  try {
    temporaryDb = db ?? (await SQLite.openDatabaseAsync(DATABASE_NAME));
    const status = await inspectOpenDatabase(temporaryDb);
    return {
      ...status,
      ready: isBundledBibleDatabaseReady(status, minimumReadyVerseCount),
    };
  } catch (error) {
    console.warn('[Bible] Failed to inspect bundled database status:', error);
    return {
      verseCount: 0,
      schemaVersion: 0,
      hasSearchIndex: false,
      ready: false,
    };
  } finally {
    if (!db && temporaryDb) {
      await temporaryDb.closeAsync();
    }
  }
}

export async function getDatabase(
  translationId: string = 'bsb'
): Promise<SQLite.SQLiteDatabase> {
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

  const database = await SQLite.openDatabaseAsync(source.databaseName, undefined, source.directory);
  await database.execAsync('PRAGMA journal_mode = WAL');
  installedDatabaseCache.set(cacheKey, database);
  return database;
}

export async function getChapter(
  translationId: string,
  bookId: string,
  chapter: number
): Promise<Verse[]> {
  const database = await getDatabase(translationId);
  const results = await database.getAllAsync<{
    id: number;
    translation_id: string;
    book_id: string;
    chapter: number;
    verse: number;
    text: string;
    heading: string | null;
  }>(
    `
      SELECT *
      FROM verses
      WHERE translation_id = ? AND book_id = ? AND chapter = ?
      ORDER BY verse
    `,
    [translationId, bookId, chapter]
  );

  return results.map((row) => ({
    id: row.id,
    bookId: row.book_id,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text,
    heading: row.heading ?? undefined,
  }));
}

export async function searchVerses(
  translationId: string,
  query: string,
  limit = 50
): Promise<Verse[]> {
  const database = await getDatabase(translationId);
  const ftsQuery = buildBibleSearchQuery(query.trim());

  if (ftsQuery && (await hasSearchIndexTable(database))) {
    try {
      const indexedResults = await database.getAllAsync<{
        id: number;
        translation_id: string;
        book_id: string;
        chapter: number;
        verse: number;
        text: string;
        heading: string | null;
      }>(
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

      return indexedResults.map((row) => ({
        id: row.id,
        bookId: row.book_id,
        chapter: row.chapter,
        verse: row.verse,
        text: row.text,
        heading: row.heading ?? undefined,
      }));
    } catch (error) {
      console.warn('[Bible] Indexed search failed, falling back to LIKE search:', error);
    }
  }

  const results = await database.getAllAsync<{
    id: number;
    translation_id: string;
    book_id: string;
    chapter: number;
    verse: number;
    text: string;
    heading: string | null;
  }>(
    `
      SELECT *
      FROM verses
      WHERE translation_id = ? AND text LIKE ?
      ORDER BY book_id, chapter, verse
      LIMIT ?
    `,
    [translationId, `%${query}%`, limit]
  );

  return results.map((row) => ({
    id: row.id,
    bookId: row.book_id,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text,
    heading: row.heading ?? undefined,
  }));
}

export async function insertVerse(
  translationId: string,
  verse: Omit<Verse, 'id'>
): Promise<void> {
  const database = await getDatabase(translationId);
  await database.runAsync(
    `
      INSERT INTO verses (translation_id, book_id, chapter, verse, text, heading)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [translationId, verse.bookId, verse.chapter, verse.verse, verse.text, verse.heading ?? null]
  );
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
          INSERT INTO verses (translation_id, book_id, chapter, verse, text, heading)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          translationId,
          verse.bookId,
          verse.chapter,
          verse.verse,
          verse.text,
          verse.heading ?? null,
        ]
      );
    }
  });
}

export async function getVerseCount(): Promise<number> {
  const status = await inspectBundledDatabaseStatus();
  return status.verseCount;
}
